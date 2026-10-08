import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Ensure the platform database exists, then return a pool connected to it.
 * Admin URL should point at the default `postgres` (or any) DB on the same server.
 */
export async function ensurePlatformDatabase(opts: {
  adminUrl: string;
  databaseUrl: string;
}): Promise<pg.Pool> {
  const target = new URL(opts.databaseUrl);
  const dbName = target.pathname.replace(/^\//, "") || "tracelens";

  const admin = new pg.Client({ connectionString: opts.adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.rowCount === 0) {
      // identifiers cannot be parameterized
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    }
  } finally {
    await admin.end();
  }

  return createPool(opts.databaseUrl);
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid database name: ${name}`);
  }
  return `"${name}"`;
}

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = join(__dirname, "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const id = file;
    const already = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE id = $1`,
      [id],
    );
    if ((already.rowCount ?? 0) > 0) continue;

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
      await client.query("COMMIT");
      applied.push(id);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

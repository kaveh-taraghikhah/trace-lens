import {
  ensurePlatformDatabase,
  migrate,
} from "./pool.js";

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://tracelens:tracelens@localhost:5432/tracelens";
  const adminUrl =
    process.env.DATABASE_ADMIN_URL ??
    databaseUrl.replace(/\/[^/]+$/, "/postgres");

  const pool = await ensurePlatformDatabase({ adminUrl, databaseUrl });
  try {
    const applied = await migrate(pool);
    console.log(
      applied.length
        ? `Applied migrations: ${applied.join(", ")}`
        : "Migrations already up to date",
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

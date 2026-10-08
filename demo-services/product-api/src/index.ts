import Fastify from "fastify";
import pg from "pg";
import { initTelemetry, SpanStatusCode, trace } from "@tracelens/telemetry";
import type { Product } from "@tracelens/types";

const PORT = Number(process.env.PORT ?? 3002);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://tracelens:tracelens@localhost:5432/tracelens_demo";

async function main() {
  const { logger } = await initTelemetry({ serviceName: "product-api" });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok", service: "product-api" }));

  app.get<{ Querystring: { stress_cardinality?: string } }>(
    "/products",
    async (req, reply) => {
      const span = trace.getActiveSpan();
      // Intentional demo foot-gun: unique attribute per request when enabled.
      if (req.query.stress_cardinality === "1") {
        span?.setAttribute(
          "demo.cardinality_trap",
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
      }
      try {
        const result = await pool.query<{
          id: string;
          name: string;
          price_cents: number;
          stock: number;
        }>("SELECT id, name, price_cents, stock FROM products ORDER BY name");

        const products: Product[] = result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          priceCents: row.price_cents,
          stock: row.stock,
        }));

        logger.info({ count: products.length }, "listed products");
        return products;
      } catch (err) {
        span?.setStatus({ code: SpanStatusCode.ERROR });
        logger.error({ err }, "failed to list products");
        return reply.code(500).send({ error: "failed to list products" });
      }
    },
  );

  app.get<{ Params: { id: string } }>("/products/:id", async (req, reply) => {
    const { id } = req.params;
    const span = trace.getActiveSpan();
    span?.setAttribute("product.id", id);

    try {
      const result = await pool.query<{
        id: string;
        name: string;
        price_cents: number;
        stock: number;
      }>("SELECT id, name, price_cents, stock FROM products WHERE id = $1", [
        id,
      ]);

      if (result.rowCount === 0) {
        logger.warn({ productId: id }, "product not found");
        return reply.code(404).send({ error: "product not found" });
      }

      const row = result.rows[0]!;
      const product: Product = {
        id: row.id,
        name: row.name,
        priceCents: row.price_cents,
        stock: row.stock,
      };

      logger.info({ productId: id }, "fetched product");
      return product;
    } catch (err) {
      span?.setStatus({ code: SpanStatusCode.ERROR });
      logger.error({ err, productId: id }, "failed to fetch product");
      return reply.code(500).send({ error: "failed to fetch product" });
    }
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT }, "product-api listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

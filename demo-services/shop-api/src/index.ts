import Fastify from "fastify";
import { initTelemetry } from "@tracelens/telemetry";
import type { CreateOrderRequest, Order, Product } from "@tracelens/types";

const PORT = Number(process.env.PORT ?? 3001);
const PRODUCT_API_URL = process.env.PRODUCT_API_URL ?? "http://localhost:3002";
const ORDER_API_URL = process.env.ORDER_API_URL ?? "http://localhost:3003";

async function main() {
  const { logger } = await initTelemetry({ serviceName: "shop-api" });
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok", service: "shop-api" }));

  app.get("/products", async (_req, reply) => {
    const res = await fetch(`${PRODUCT_API_URL}/products`);
    if (!res.ok) {
      logger.error({ status: res.status }, "upstream product-api failed");
      return reply.code(502).send({ error: "product_api_unavailable" });
    }
    const products = (await res.json()) as Product[];
    logger.info({ count: products.length }, "proxied product list");
    return products;
  });

  app.post<{ Body: CreateOrderRequest }>("/orders", async (req, reply) => {
    const res = await fetch(`${ORDER_API_URL}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const payload = await res.json();
    if (!res.ok) {
      logger.error({ status: res.status, payload }, "order creation failed");
      return reply.code(res.status).send(payload);
    }

    const order = payload as Order;
    logger.info({ orderId: order.id }, "order created via shop gateway");
    return order;
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT }, "shop-api listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import pg from "pg";
import { initTelemetry, SpanStatusCode, trace } from "@tracelens/telemetry";
import type {
  CreateOrderRequest,
  Order,
  PaymentResult,
  Product,
} from "@tracelens/types";

const PORT = Number(process.env.PORT ?? 3003);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://tracelens:tracelens@localhost:5432/tracelens_demo";
const PRODUCT_API_URL = process.env.PRODUCT_API_URL ?? "http://localhost:3002";
const PAYMENT_API_URL = process.env.PAYMENT_API_URL ?? "http://localhost:3004";
const NOTIFICATION_URL =
  process.env.NOTIFICATION_URL ?? "http://localhost:3005";

async function main() {
  const { logger } = await initTelemetry({ serviceName: "order-api" });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok", service: "order-api" }));

  app.post<{ Body: CreateOrderRequest }>("/orders", async (req, reply) => {
    const tracer = trace.getTracer("order-api");
    const body = req.body;
    const orderId = `ord_${randomUUID().slice(0, 8)}`;

    return tracer.startActiveSpan("validate-order", async (validateSpan) => {
      try {
        if (!body.productId || !body.quantity || body.quantity < 1) {
          validateSpan.setStatus({ code: SpanStatusCode.ERROR });
          validateSpan.end();
          return reply.code(400).send({ error: "invalid order" });
        }
        validateSpan.end();

        const productRes = await fetch(
          `${PRODUCT_API_URL}/products/${body.productId}`,
        );
        if (!productRes.ok) {
          logger.warn({ productId: body.productId }, "product lookup failed");
          return reply.code(400).send({ error: "product not found" });
        }
        const product = (await productRes.json()) as Product;
        const totalCents = product.priceCents * body.quantity;

        const paymentRes = await fetch(`${PAYMENT_API_URL}/payments`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId,
            amountCents: totalCents,
            customerId: body.customerId,
            method: "card",
          }),
        });

        if (!paymentRes.ok) {
          const order: Order = {
            id: orderId,
            productId: body.productId,
            quantity: body.quantity,
            customerId: body.customerId,
            totalCents,
            status: "failed",
            createdAt: new Date().toISOString(),
          };

          await pool.query(
            `INSERT INTO orders (id, product_id, quantity, customer_id, total_cents, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              order.id,
              order.productId,
              order.quantity,
              order.customerId,
              order.totalCents,
              order.status,
            ],
          );

          logger.error({ orderId }, "order payment failed");
          return reply.code(502).send({ error: "payment_failed", order });
        }

        const payment = (await paymentRes.json()) as PaymentResult;

        await pool.query(
          `INSERT INTO orders (id, product_id, quantity, customer_id, total_cents, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            body.productId,
            body.quantity,
            body.customerId,
            totalCents,
            "paid",
          ],
        );

        await fetch(`${NOTIFICATION_URL}/notify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId,
            customerId: body.customerId,
            channel: "email",
          }),
        });

        const order: Order = {
          id: orderId,
          productId: body.productId,
          quantity: body.quantity,
          customerId: body.customerId,
          totalCents,
          status: "notified",
          createdAt: new Date().toISOString(),
        };

        await pool.query(`UPDATE orders SET status = $1 WHERE id = $2`, [
          "notified",
          orderId,
        ]);

        logger.info(
          { orderId, paymentId: payment.paymentId, totalCents },
          "order completed",
        );

        return order;
      } catch (err) {
        logger.error({ err, orderId }, "order failed");
        return reply.code(500).send({ error: "order_failed" });
      }
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT }, "order-api listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

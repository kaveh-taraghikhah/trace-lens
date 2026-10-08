import Fastify from "fastify";
import { initTelemetry, SpanStatusCode, trace } from "@tracelens/telemetry";
import type { PaymentRequest, PaymentResult } from "@tracelens/types";

const PORT = Number(process.env.PORT ?? 3004);

let simulateIncident = process.env.SIMULATE_INCIDENT === "true";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callStripe(
  amountCents: number,
  customerId: string,
): Promise<{ ok: boolean; durationMs: number }> {
  const tracer = trace.getTracer("payment-api");
  return tracer.startActiveSpan("Stripe API", async (span) => {
    const start = Date.now();
    span.setAttribute("payment.provider", "stripe");
    span.setAttribute("payment.amount_cents", amountCents);
    span.setAttribute("customer.id", customerId);
    span.setAttribute("customer.region", "EU");

    const baseLatency = simulateIncident ? 1200 + Math.random() * 400 : 80 + Math.random() * 120;
    await sleep(baseLatency);

    const failRate = simulateIncident ? 0.3 : 0.02;
    const ok = Math.random() >= failRate;
    const durationMs = Date.now() - start;

    span.setAttribute("payment.duration_ms", durationMs);

    if (!ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: "Payment provider timeout" });
      span.end();
      return { ok: false, durationMs };
    }

    span.end();
    return { ok: true, durationMs };
  });
}

async function main() {
  const { logger } = await initTelemetry({ serviceName: "payment-api" });
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    status: "ok",
    service: "payment-api",
    simulateIncident,
  }));

  app.post("/simulate-incident", async () => {
    simulateIncident = true;
    logger.warn("incident simulation ENABLED");
    return { simulateIncident: true };
  });

  app.delete("/simulate-incident", async () => {
    simulateIncident = false;
    logger.info("incident simulation DISABLED");
    return { simulateIncident: false };
  });

  app.post<{ Body: PaymentRequest }>("/payments", async (req, reply) => {
    const body = req.body;
    const span = trace.getActiveSpan();
    span?.setAttribute("order.id", body.orderId);
    span?.setAttribute("payment.method", body.method ?? "card");
    span?.setAttribute("payment.provider", "stripe");

    logger.info(
      { orderId: body.orderId, amountCents: body.amountCents },
      "processing payment",
    );

    const stripe = await callStripe(body.amountCents, body.customerId);

    if (!stripe.ok) {
      logger.error(
        {
          orderId: body.orderId,
          duration_ms: stripe.durationMs,
          message: "Payment provider timeout",
        },
        "Payment provider timeout",
      );

      if (simulateIncident) {
        logger.warn({ orderId: body.orderId }, "Retrying payment request");
        const retry = await callStripe(body.amountCents, body.customerId);
        if (!retry.ok) {
          logger.error(
            { orderId: body.orderId, duration_ms: retry.durationMs },
            "Payment provider timeout",
          );
          span?.setStatus({ code: SpanStatusCode.ERROR });
          return reply.code(500).send({
            error: "payment_failed",
            message: "Payment provider timeout",
          });
        }
        const result: PaymentResult = {
          paymentId: `pay_${Date.now()}`,
          orderId: body.orderId,
          status: "succeeded",
          provider: "stripe",
          durationMs: stripe.durationMs + retry.durationMs,
        };
        return result;
      }

      span?.setStatus({ code: SpanStatusCode.ERROR });
      return reply.code(500).send({
        error: "payment_failed",
        message: "Payment provider timeout",
      });
    }

    const result: PaymentResult = {
      paymentId: `pay_${Date.now()}`,
      orderId: body.orderId,
      status: "succeeded",
      provider: "stripe",
      durationMs: stripe.durationMs,
    };

    logger.info(
      { orderId: body.orderId, paymentId: result.paymentId, duration_ms: stripe.durationMs },
      "payment succeeded",
    );

    return result;
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT, simulateIncident }, "payment-api listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

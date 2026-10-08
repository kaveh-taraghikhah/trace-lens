import Fastify from "fastify";
import { initTelemetry, trace } from "@tracelens/telemetry";

const PORT = Number(process.env.PORT ?? 3005);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { logger } = await initTelemetry({
    serviceName: "notification-worker",
  });
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    status: "ok",
    service: "notification-worker",
  }));

  app.post<{
    Body: { orderId: string; customerId: string; channel?: string };
  }>("/notify", async (req) => {
    const { orderId, customerId, channel = "email" } = req.body;
    const tracer = trace.getTracer("notification-worker");

    return tracer.startActiveSpan("send-notification", async (span) => {
      span.setAttribute("order.id", orderId);
      span.setAttribute("notification.channel", channel);
      span.setAttribute("customer.id", customerId);

      await sleep(50 + Math.random() * 100);

      logger.info(
        { orderId, customerId, channel },
        "notification sent",
      );

      span.end();
      return { status: "sent", orderId, channel };
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info({ port: PORT }, "notification-worker listening");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

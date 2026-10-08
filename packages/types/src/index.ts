export const DEMO_SERVICES = [
  "shop-api",
  "product-api",
  "order-api",
  "payment-api",
  "notification-worker",
] as const;

export type DemoServiceName = (typeof DEMO_SERVICES)[number];

export interface ServiceEndpoints {
  shopApi: string;
  productApi: string;
  orderApi: string;
  paymentApi: string;
  notificationWorker: string;
}

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

export interface CreateOrderRequest {
  productId: string;
  quantity: number;
  customerId: string;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  customerId: string;
  totalCents: number;
  status: "pending" | "paid" | "failed" | "notified";
  createdAt: string;
}

export interface PaymentRequest {
  orderId: string;
  amountCents: number;
  customerId: string;
  method?: "card" | "wallet";
}

export interface PaymentResult {
  paymentId: string;
  orderId: string;
  status: "succeeded" | "failed";
  provider: "stripe";
  durationMs: number;
}

export type {
  ServiceHealth,
  ServiceRedMetrics,
  ServicesOverview,
} from "./services.js";

export { KNOWN_DEMO_SERVICES } from "./services.js";

export type {
  SpanStatus,
  TraceSummary,
  TraceSearchResult,
  TraceSpan,
  TraceDetail,
} from "./traces.js";

export type { LogLevel, LogEntry, LogSearchResult } from "./logs.js";

export type {
  ServiceMapNode,
  ServiceMapEdge,
  ServiceMap,
} from "./service-map.js";

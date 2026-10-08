import { z } from "zod";

export const CreateAlertRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  metricType: z.enum([
    "error_rate",
    "p95_latency",
    "request_rate",
    "request_rate_drop",
  ]),
  service: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  comparator: z.enum(["gt", "lt"]),
  threshold: z.number().finite(),
  windowSeconds: z.number().int().min(60).max(3600).default(300),
  forSeconds: z.number().int().min(0).max(3600).default(60),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  enabled: z.boolean().default(true),
});

export const UpdateAlertRuleSchema = CreateAlertRuleSchema.partial();

export type CreateAlertRuleInput = z.infer<typeof CreateAlertRuleSchema>;
export type UpdateAlertRuleInput = z.infer<typeof UpdateAlertRuleSchema>;

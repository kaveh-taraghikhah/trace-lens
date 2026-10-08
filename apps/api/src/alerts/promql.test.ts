import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AlertRule } from "@tracelens/database";
import {
  buildAlertPromql,
  buildAlertPromqlCandidates,
  compareValue,
  fingerprint,
  formatMetricValue,
} from "./promql.js";

function rule(partial: Partial<AlertRule> & Pick<AlertRule, "metricType">): AlertRule {
  return {
    id: "rule-1",
    projectId: "proj-1",
    name: "test rule",
    description: "",
    service: "payment-api",
    comparator: "gt",
    threshold: 0.05,
    windowSeconds: 60,
    forSeconds: 30,
    severity: "warning",
    enabled: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("compareValue", () => {
  it("supports gt and lt", () => {
    assert.equal(compareValue(0.1, "gt", 0.05), true);
    assert.equal(compareValue(0.05, "gt", 0.05), false);
    assert.equal(compareValue(0.01, "lt", 0.05), true);
    assert.equal(compareValue(0.05, "lt", 0.05), false);
  });

  it("rejects non-finite values", () => {
    assert.equal(compareValue(Number.NaN, "gt", 0), false);
    assert.equal(compareValue(Number.POSITIVE_INFINITY, "gt", 0), false);
  });
});

describe("formatMetricValue", () => {
  it("formats ratios as percent", () => {
    assert.equal(formatMetricValue("error_rate", 0.1234), "12.34%");
    assert.equal(formatMetricValue("request_rate_drop", 0.5), "50.00%");
  });

  it("formats latency in ms or seconds", () => {
    assert.equal(formatMetricValue("p95_latency", 240), "240ms");
    assert.equal(formatMetricValue("p95_latency", 1500), "1.50s");
  });

  it("formats request rate as fixed decimals", () => {
    assert.equal(formatMetricValue("request_rate", 12.3456), "12.346");
  });
});

describe("fingerprint", () => {
  it("joins rule id and service", () => {
    assert.equal(fingerprint("abc", "payment-api"), "abc:payment-api");
  });
});

describe("buildAlertPromqlCandidates", () => {
  it("emits status-label and histogram-unit variants for error_rate", () => {
    const queries = buildAlertPromqlCandidates(rule({ metricType: "error_rate" }));
    assert.equal(queries.length, 4);
    assert.ok(queries.every((q) => q.includes('service_name="payment-api"')));
    assert.ok(queries.some((q) => q.includes("http_status_code")));
    assert.ok(queries.some((q) => q.includes("http_response_status_code")));
    assert.ok(queries.some((q) => q.includes("duration_milliseconds_count")));
    assert.ok(queries.some((q) => q.includes("request_duration_seconds_count")));
  });

  it("scales seconds histogram to ms for p95_latency", () => {
    const queries = buildAlertPromqlCandidates(rule({ metricType: "p95_latency" }));
    assert.equal(queries.length, 2);
    assert.ok(queries[1]!.includes("* 1000"));
  });

  it("escapes service labels and uses the configured window", () => {
    const queries = buildAlertPromqlCandidates(
      rule({
        metricType: "request_rate",
        service: 'shop"api',
        windowSeconds: 90,
      }),
    );
    assert.ok(queries[0]!.includes('service_name="shop\\"api"'));
    assert.ok(queries.every((q) => q.includes("[90s]")));
  });

  it("omits service selector when rule is fleet-wide", () => {
    const queries = buildAlertPromqlCandidates(
      rule({ metricType: "request_rate", service: null }),
    );
    assert.ok(queries.every((q) => !q.includes("service_name=")));
  });

  it("buildAlertPromql returns the first candidate", () => {
    const r = rule({ metricType: "error_rate" });
    assert.equal(buildAlertPromql(r), buildAlertPromqlCandidates(r)[0]);
  });
});

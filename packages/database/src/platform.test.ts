import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateApiKeyPlaintext,
  hashApiKey,
  roleAtLeast,
} from "./platform.js";

describe("roleAtLeast", () => {
  it("orders viewer < operator < admin", () => {
    assert.equal(roleAtLeast("admin", "viewer"), true);
    assert.equal(roleAtLeast("admin", "admin"), true);
    assert.equal(roleAtLeast("operator", "admin"), false);
    assert.equal(roleAtLeast("viewer", "operator"), false);
    assert.equal(roleAtLeast("operator", "operator"), true);
  });
});

describe("hashApiKey", () => {
  it("is deterministic for a fixed pepper", () => {
    const pepper = "test-pepper-only";
    const a = hashApiKey("tl_live_abc", pepper);
    const b = hashApiKey("tl_live_abc", pepper);
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("changes when plaintext or pepper changes", () => {
    const pepper = "p1";
    assert.notEqual(
      hashApiKey("key-a", pepper),
      hashApiKey("key-b", pepper),
    );
    assert.notEqual(
      hashApiKey("same", "pepper-a"),
      hashApiKey("same", "pepper-b"),
    );
  });
});

describe("generateApiKeyPlaintext", () => {
  it("returns tl_live prefix and display prefix", () => {
    const { plaintext, prefix } = generateApiKeyPlaintext();
    assert.ok(plaintext.startsWith("tl_live_"));
    assert.equal(prefix, plaintext.slice(0, 12));
    assert.notEqual(plaintext, prefix);
  });
});

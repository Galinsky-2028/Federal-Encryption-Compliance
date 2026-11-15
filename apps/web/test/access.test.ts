import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAccess } from "../lib/access";

const production = {
  FDEA_DEMO_MODE: "false",
  FDEA_ADMIN_USERNAME: "operator",
  FDEA_ADMIN_PASSWORD: "a-strong-example-password-not-for-production",
};
const basic = (value: string) => "Basic " + Buffer.from(value, "utf8").toString("base64");

test("fictional demo is public only when explicitly enabled", () => {
  assert.equal(evaluateAccess(null, { FDEA_DEMO_MODE: "true" }), "demo");
  assert.equal(evaluateAccess(null, {}), "unconfigured");
});

test("real-data mode fails closed for missing or weak access secrets", () => {
  assert.equal(evaluateAccess(null, { FDEA_ADMIN_USERNAME: "admin", FDEA_ADMIN_PASSWORD: "short" }), "unconfigured");
  assert.equal(evaluateAccess(null, { FDEA_ADMIN_USERNAME: "admin" }), "unconfigured");
});

test("real-data mode enforces matching credentials", () => {
  assert.equal(evaluateAccess(null, production), "unauthorized");
  assert.equal(evaluateAccess(basic("operator:wrong-password"), production), "unauthorized");
  assert.equal(evaluateAccess(basic("other:" + production.FDEA_ADMIN_PASSWORD), production), "unauthorized");
  assert.equal(evaluateAccess(basic("operator:" + production.FDEA_ADMIN_PASSWORD), production), "authorized");
});

test("malformed and oversized auth headers fail closed", () => {
  assert.equal(evaluateAccess("Bearer token", production), "unauthorized");
  assert.equal(evaluateAccess("Basic !!!!!", production), "unauthorized");
  assert.equal(evaluateAccess("Basic " + "A".repeat(9000), production), "unauthorized");
  assert.equal(evaluateAccess(basic("missing-colon"), production), "unauthorized");
});

test("demo flag variants never open real-data mode by accident", () => {
  for (const value of ["false", "0", "off", "", " no "]) {
    assert.equal(evaluateAccess(null, { ...production, FDEA_DEMO_MODE: value }), "unauthorized");
  }
  assert.equal(evaluateAccess(basic("operator:" + " ".repeat(16)), { ...production, FDEA_ADMIN_PASSWORD: " ".repeat(16) }), "unconfigured");
});

test("proxy exempts only the anonymous engine-health probe and static assets", async () => {
  const { config } = await import("../proxy");
  const matcher = new RegExp("^" + config.matcher[0] + "$");
  for (const path of ["/", "/api/dashboard", "/api/config", "/api/reports/compliance", "/resources/demo-legacy-records"])
    assert.ok(matcher.test(path), path + " must be gated");
  for (const path of ["/api/engine-health", "/_next/static/chunk.js", "/favicon.ico"])
    assert.ok(!matcher.test(path), path + " must stay public");
});

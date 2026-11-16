import assert from "node:assert/strict";
import test from "node:test";

import { evaluationFixtures } from "@federal-encryption/evaluation";

import { provisionDemoTenant, provisionDemoTenantOnStart, type ProvisionDeps } from "../lib/provision";

function fake(existing: string[] = []) {
  const refs = new Set(existing);
  const calls = { policy: 0, evaluated: [] as string[] };
  const deps: ProvisionDeps = {
    async listExternalRefs() { return new Set(refs); },
    async provisionPolicy() { calls.policy++; return { policyId: "p1", registeredRuleSetId: "r1", ruleSetStatus: "draft" }; },
    async evaluateFixture(f) { calls.evaluated.push(f.resource.externalRef ?? ""); refs.add(f.resource.externalRef ?? ""); },
  };
  return { deps, calls };
}

test("first run registers the draft policy once and evaluates every fixture", async () => {
  const { deps, calls } = fake();
  const out = await provisionDemoTenant(deps);
  assert.equal(calls.policy, 1);
  assert.equal(out.created, evaluationFixtures.length);
  const again = await provisionDemoTenant(deps);
  assert.equal(calls.policy, 1, "no duplicate policy");
  assert.deepEqual([again.created, again.existing], [0, evaluationFixtures.length]);
});

test("partial state resumes only missing fixtures without a new policy", async () => {
  const { deps, calls } = fake([evaluationFixtures[0].resource.externalRef ?? ""]);
  await provisionDemoTenant(deps);
  assert.equal(calls.policy, 0);
  assert.equal(calls.evaluated.length, evaluationFixtures.length - 1);
});

test("an active (enacted-looking) rule set is refused", async () => {
  const { deps } = fake();
  deps.provisionPolicy = async () => ({ policyId: "p", registeredRuleSetId: "r", ruleSetStatus: "active" });
  await assert.rejects(provisionDemoTenant(deps), /unexpectedly active/);
});

test("startup hook is opt-in, refuses demo mode and bad config, retries then gives up", async () => {
  let built = 0;
  const depsFactory = () => { built++; throw new Error("engine asleep"); };
  const configured = { CAIAE_ORGANIZATION_ID: "8f0e2c1a-1b2c-4d3e-8f90-123456789abc", CAIAE_OPERATOR_TOKEN: "tok", CAIAE_API_BASE_URL: "https://engine.example.test" };
  await provisionDemoTenantOnStart({ ...configured }, { attempts: 2, delayMs: 1, depsFactory: depsFactory as never });
  await provisionDemoTenantOnStart({ ...configured, FDEA_PROVISION_DEMO_TENANT: "true", FDEA_DEMO_MODE: "true" }, { attempts: 2, delayMs: 1, depsFactory: depsFactory as never });
  await provisionDemoTenantOnStart({ ...configured, CAIAE_ORGANIZATION_ID: "x", FDEA_PROVISION_DEMO_TENANT: "true" }, { attempts: 2, delayMs: 1, depsFactory: depsFactory as never });
  assert.equal(built, 0);
  await provisionDemoTenantOnStart({ ...configured, FDEA_PROVISION_DEMO_TENANT: "true" }, { attempts: 3, delayMs: 1, depsFactory: depsFactory as never });
  assert.equal(built, 3);
});

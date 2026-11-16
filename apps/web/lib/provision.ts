import {
  evaluationFixtures,
  FederalEncryptionEvaluator,
  type FederalResourceFixture,
} from "@federal-encryption/evaluation";
import { provisionFederalDataEncryptionPolicy } from "@federal-encryption/policy";

import { isFederalDemoMode } from "./demo-mode";
import { readOperatorReadiness, type OperatorEnvironment } from "./operator";

/**
 * Opt-in provisioning of a FICTIONAL demonstration tenant in real-data mode,
 * using the repository's documented paths: the draft policy bundle
 * (`npm run policy:provision`, never activated: no effective date) and the
 * evaluation fixtures (`npm run evaluation:fixture`, simulation mode). Runs
 * only when FDEA_PROVISION_DEMO_TENANT=true, demo mode is off and the CAIAE
 * operator is configured. It never sets FDEA_EFFECTIVE_FROM or
 * FDEA_ENACTMENT_REFERENCE; the bill stays a draft. Idempotent: fixtures with
 * an existing externalRef are skipped, and the draft policy is registered
 * only when no fixture exists yet.
 */
export type ProvisionEnvironment = OperatorEnvironment & {
  FDEA_PROVISION_DEMO_TENANT?: string;
};

export type ProvisionDeps = {
  listExternalRefs(): Promise<Set<string>>;
  provisionPolicy(): Promise<{ policyId: string; registeredRuleSetId: string; ruleSetStatus: string }>;
  evaluateFixture(fixture: FederalResourceFixture): Promise<unknown>;
};

export async function provisionDemoTenant(deps: ProvisionDeps, fixtures: readonly FederalResourceFixture[] = evaluationFixtures) {
  const refs = await deps.listExternalRefs();
  const missing = fixtures.filter((f) => !refs.has(f.resource.externalRef ?? ""));
  let policy: { policyId: string; registeredRuleSetId: string; ruleSetStatus: string } | null = null;
  if (missing.length === fixtures.length) {
    policy = await deps.provisionPolicy();
    if (policy.ruleSetStatus === "active") throw new Error("draft policy unexpectedly active");
  }
  for (const fixture of missing) await deps.evaluateFixture(fixture);
  return { created: missing.length, existing: fixtures.length - missing.length, policy };
}

function engineDeps(env: ProvisionEnvironment): ProvisionDeps {
  const readiness = readOperatorReadiness(env);
  const options = { baseUrl: readiness.engineBaseUrl, organizationId: readiness.organizationId ?? "",
    operatorToken: env.CAIAE_OPERATOR_TOKEN?.trim() ?? "" };
  const evaluator = new FederalEncryptionEvaluator(options);
  return {
    async listExternalRefs() {
      const { createOperatorEngineClient } = await import("./operator");
      const resources = await createOperatorEngineClient(env).listResources({});
      return new Set(resources.map((r) => r.externalRef).filter((x): x is string => typeof x === "string"));
    },
    provisionPolicy: () => provisionFederalDataEncryptionPolicy(options),
    evaluateFixture: (fixture) => evaluator.evaluateFixture(fixture, { evaluationMode: { mode: "simulation" }, syncFindings: false }),
  };
}

const log = (event: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));

/** Startup entry point: retries while the (free-plan) engine wakes up. Never throws. */
export async function provisionDemoTenantOnStart(
  env: ProvisionEnvironment = process.env as ProvisionEnvironment,
  { attempts = 12, delayMs = 15_000, depsFactory = engineDeps } = {},
): Promise<void> {
  if (env.FDEA_PROVISION_DEMO_TENANT?.trim().toLowerCase() !== "true") return;
  if (isFederalDemoMode(env)) { log("fdea.demo_tenant.skipped", { reason: "demo_mode" }); return; }
  let configured = false;
  try { configured = readOperatorReadiness(env).configured; } catch { configured = false; }
  if (!configured) { log("fdea.demo_tenant.skipped", { reason: "operator_unconfigured" }); return; }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await provisionDemoTenant(depsFactory(env));
      log("fdea.demo_tenant.provisioned", { created: result.created, existing: result.existing, attempt,
        policyId: result.policy?.policyId ?? null, registeredRuleSetId: result.policy?.registeredRuleSetId ?? null,
        ruleSetStatus: result.policy?.ruleSetStatus ?? null });
      return;
    } catch (error) {
      log("fdea.demo_tenant.retry", { attempt, error: error instanceof Error ? error.name + ": " + error.message.slice(0, 160) : "unknown" });
      if (attempt < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  log("fdea.demo_tenant.failed", { attempts });
}

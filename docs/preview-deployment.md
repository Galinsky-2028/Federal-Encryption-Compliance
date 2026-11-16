# Preview deployment

The Federal Encryption application has a reproducible Render preview definition at the repository root in `render.yaml`.

## Purpose

The preview is for rapid visual and workflow inspection during development. It is not a production deployment and must not contain real agency data or credentials.

The default preview is intentionally configured for fictional demo data:

```
FDEA_DEMO_MODE=true
```

Demo mode is self-contained and supplies fictional agency, resource, finding, deadline, remediation, certification, filing, audit, drill-down, health, and export data without requiring a database or operator token. It remains legally fail-closed: it does not set `FDEA_EFFECTIVE_FROM` or `FDEA_ENACTMENT_REFERENCE`, so the interface continues to identify the Federal Data Encryption Act source as **Draft / simulation**.

## Render service

The Blueprint defines:

- a Node 24 web service;
- Virginia region;
- the repository root as the build context;
- `npm ci && npm run build` (lockfile-enforced);
- the supported Next.js `next start` runtime;
- deploy-after-checks behavior;
- `/api/config` as the lightweight health check;
- automatic preview-environment generation for pull requests when the Blueprint is connected in Render.

No secrets are committed to the Blueprint.

The live preview runs in the Galinsky-2028 Render workspace on the free plan as service `federal-encryption-preview` (`srv-dbsvlelg1s2s738bj450`) at https://federal-encryption-preview-kbzi.onrender.com, auto-deploying from `main` after checks pass. Free instances sleep after roughly 15 idle minutes, so the first request after idle can take up to a minute.

## Production-style engine mode

To connect the UI to a real Compliance, Authorization & Immutable Audit Engine deployment instead of fictional demo data, disable demo mode and configure these server-side values:

```
FDEA_DEMO_MODE=false
FDEA_ADMIN_USERNAME=...
FDEA_ADMIN_PASSWORD=...
CAIAE_API_BASE_URL=https://...
CAIAE_ORGANIZATION_ID=...
CAIAE_OPERATOR_TOKEN=...
```

The operator token must remain server-side.

Every page and API except the anonymous `/api/engine-health` probe is behind an operator access gate whenever demo mode is off (`apps/web/proxy.ts`, `apps/web/lib/access.ts`). Without `FDEA_ADMIN_USERNAME` and an `FDEA_ADMIN_PASSWORD` of at least 16 non-blank characters the app returns 503; with them it requires matching HTTP Basic credentials over HTTPS. This is a small deployment gate, not individual identities, MFA or a replacement for engine authorization. Never combine demo mode with real secrets: run real mode as a separate service.

Live legal mode additionally requires both:

```
FDEA_EFFECTIVE_FROM=...
FDEA_ENACTMENT_REFERENCE=...
```

Do not set those values merely to make a demo look enacted.

## Smoke test

After a deploy:

```
PREVIEW_BASE_URL=https://federal-encryption-preview-kbzi.onrender.com npm run preview:smoke
```

`.github/workflows/preview-smoke.yml` runs the same check after successful CI on `main`, every 6 hours and on manual dispatch. The schedule is deliberately infrequent so the probe does not keep the free instance awake and exhaust the workspace's shared free instance-hours.

The smoke test verifies the public application shell, public configuration, demo runtime health, dashboard API, JSON report export, and a fictional resource drill-down route.

## Fictional demo-tenant provisioning (real-data mode)

Set `FDEA_PROVISION_DEMO_TENANT=true` on a real-mode service connected to a fictional demonstration tenant. On startup, `apps/web/instrumentation.ts` then runs the documented provisioning paths:
- the draft Federal Data Encryption Act policy bundle (`policy:provision`), registered as a draft and never activated;
- the four fictional evaluation fixtures (`evaluation:fixture`, simulation mode).

Fixtures already present by `externalRef` are skipped, and the policy is registered only when none exist. The hook refuses an active rule set, retries while a free-plan engine wakes, logs only counts and identifiers, and never blocks startup. `FDEA_EFFECTIVE_FROM` and `FDEA_ENACTMENT_REFERENCE` must stay unset.

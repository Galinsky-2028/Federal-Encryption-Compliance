/** Next.js startup hook: opt-in fictional demo-tenant provisioning (real-data mode only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.FDEA_PROVISION_DEMO_TENANT?.trim().toLowerCase() !== "true") return;
  const { provisionDemoTenantOnStart } = await import("./lib/provision");
  void provisionDemoTenantOnStart();
}

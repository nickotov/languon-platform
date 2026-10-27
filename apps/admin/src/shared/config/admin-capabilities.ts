// Local delegation is intentionally unavailable in production admin builds.
// This is build-mode policy, not a deploy-time switch that can enable production.
export const adminMcpEnabled = import.meta.env.DEV && !import.meta.env.PROD;

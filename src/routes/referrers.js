import { handleBreakdown } from "../lib/aggregate.js";

export async function handleReferrers(request, env) {
  return handleBreakdown(request, env, { cacheName: "referrers", groupByExpr: "referrer_domain" });
}

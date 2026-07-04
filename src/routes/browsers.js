import { handleBreakdown } from "../lib/aggregate.js";

export async function handleBrowsers(request, env) {
  return handleBreakdown(request, env, { cacheName: "browsers", groupByExpr: "browser" });
}

import { handleBreakdown } from "../lib/aggregate.js";

export async function handlePages(request, env) {
  return handleBreakdown(request, env, { cacheName: "pages", groupByExpr: "url" });
}

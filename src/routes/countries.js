import { handleBreakdown } from "../lib/aggregate.js";

export async function handleCountries(request, env) {
  return handleBreakdown(request, env, { cacheName: "countries", groupByExpr: "country" });
}

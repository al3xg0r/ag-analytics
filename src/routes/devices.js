import { handleBreakdown } from "../lib/aggregate.js";
import { error } from "../lib/response.js";

export async function handleDevices(request, env) {
  const url = new URL(request.url);
  const dimension = url.searchParams.get("dimension") || "device_type"; // device_type | os | screen_resolution
  const allowed = ["device_type", "os", "screen_resolution"];
  if (!allowed.includes(dimension)) return error("dimension must be one of: " + allowed.join(", "));

  return handleBreakdown(request, env, { cacheName: `devices:${dimension}`, groupByExpr: dimension });
}

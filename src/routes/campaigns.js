import { handleBreakdown } from "../lib/aggregate.js";

// Breaks visits down by UTM campaign (utm_campaign), so marketing campaigns
// are visible without having to query the database directly. utm_source and
// utm_medium are captured too but aren't broken out into their own panel yet
// — campaign name is normally the most useful grouping for "did this
// campaign work" at a glance.
export async function handleCampaigns(request, env) {
  return handleBreakdown(request, env, { cacheName: "campaigns", groupByExpr: "utm_campaign" });
}

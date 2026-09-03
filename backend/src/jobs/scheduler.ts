// Background job scheduler.
//
// Intentionally simple (setInterval, in-process) rather than a queue broker —
// correct for a single-node deployment. If this ever needs to run on multiple
// instances, swap the interval loops for a real queue (BullMQ/Redis) behind
// the same job functions; nothing about their logic needs to change.

import { env } from "../config/env";
import { evaluateAllActiveUsers } from "../lib/services/alerts";
import { startScannerBackgroundJob } from "../lib/services/scanner";
import { getBacktestedTrackRecord, getLiveTrackRecord } from "../lib/services/trackRecord";
import { getFundRecommendations } from "../lib/services/fundRecommendations";

export function startBackgroundJobs() {
  if (!env.enableJobs) {
    console.log("[jobs] Background jobs disabled (ENABLE_BACKGROUND_JOBS=false)");
    return;
  }

  // Register scanner background job
  try {
    startScannerBackgroundJob();
  } catch (err) {
    console.error("[jobs] Failed to start scanner background job:", err);
  }

  // Pre-warm the track record cache so the first dashboard visitor doesn't pay
  // for the full-universe backtest inline.
  Promise.all([getBacktestedTrackRecord(), getLiveTrackRecord()])
    .then(() => console.log("[jobs] Track record cache pre-warmed"))
    .catch((err) => console.error("[jobs] Track record pre-warm failed:", err));

  // Same reasoning: the mutual-fund recommendation list fetches ~13 real
  // schemes from the AMFI feed on a cold cache — pre-warm it so neither the
  // Mutual Funds page nor a goal's fund suggestion pays that cost inline.
  getFundRecommendations()
    .then(() => console.log("[jobs] Fund recommendations cache pre-warmed"))
    .catch((err) => console.error("[jobs] Fund recommendations pre-warm failed:", err));

  const alertTimer = setInterval(async () => {
    try {
      const result = await evaluateAllActiveUsers();
      if (result.triggered > 0) {
        console.log(`[jobs] alert-runner: checked ${result.users} users, triggered ${result.triggered} alerts`);
      }
    } catch (err) {
      console.error("[jobs] alert-runner failed:", err);
    }
  }, env.alertIntervalMs);
  alertTimer.unref?.();

  console.log(`[jobs] Background jobs started (alert check every ${Math.round(env.alertIntervalMs / 1000)}s)`);
}

// Background job scheduler.
//
// Intentionally simple (setInterval, in-process) rather than a queue broker —
// correct for a single-node deployment. If this ever needs to run on multiple
// instances, swap the interval loops for a real queue (BullMQ/Redis) behind
// the same job functions; nothing about their logic needs to change.

import { env } from "../config/env";
import { evaluateAllActiveUsers } from "../lib/services/alerts";
import { startScannerBackgroundJob } from "../lib/services/scanner";

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

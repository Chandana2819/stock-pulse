// Background job scheduler.
//
// Intentionally simple (setInterval, in-process) rather than a queue broker —
// correct for a single-node deployment. If this ever needs to run on multiple
// instances, swap the interval loops for a real queue (BullMQ/Redis) behind
// the same job functions; nothing about their logic needs to change.

import { env } from "../config/env";
import { logger } from "../lib/logger";
import { evaluateAllActiveUsers } from "../lib/services/alerts";
import { evaluateSignalAlertsForAllUsers } from "../lib/services/signalAlerts";
import { startScannerBackgroundJob } from "../lib/services/scanner";
import { getBacktestedTrackRecord, getLiveTrackRecord } from "../lib/services/trackRecord";
import { getFundRecommendations } from "../lib/services/fundRecommendations";
import { runScreener } from "../lib/services/screener";
import { checkPendingSignalOutcomes } from "../lib/services/signalOutcomeTracker";

// A job silently failing every tick for hours is exactly the kind of thing
// that goes unnoticed without real alerting wired up. There's no
// Slack/PagerDuty/email hook configured in this environment, so this can't
// page anyone yet — but logging a rising consecutive-failure count at "error"
// level, distinct from a single transient failure, is what a log-based alert
// rule (e.g. "consecutiveFailures >= 3") would key off of once one exists.
function runInterval(name: string, intervalMs: number, task: () => Promise<{ usersChecked: number; [k: string]: number }>) {
  let consecutiveFailures = 0;
  const timer = setInterval(async () => {
    try {
      const result = await task();
      if (consecutiveFailures > 0) {
        logger.info(`${name} recovered after ${consecutiveFailures} failed run(s)`, { job: name });
      }
      consecutiveFailures = 0;
      const { usersChecked, ...activity } = result;
      const hasActivity = Object.values(activity).some((v) => v > 0);
      if (hasActivity) {
        logger.info(`${name} completed`, { job: name, usersChecked, ...activity });
      }
    } catch (err) {
      consecutiveFailures++;
      logger.error(`${name} failed (${consecutiveFailures} consecutive failure(s))`, err, {
        job: name,
        consecutiveFailures,
      });
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function startBackgroundJobs() {
  if (!env.enableJobs) {
    logger.info("Background jobs disabled (ENABLE_BACKGROUND_JOBS=false)");
    return;
  }

  // Register scanner background job
  try {
    startScannerBackgroundJob();
  } catch (err) {
    logger.error("Failed to start scanner background job", err);
  }

  // Pre-warm the track record cache so the first dashboard visitor doesn't pay
  // for the full-universe backtest inline.
  Promise.all([getBacktestedTrackRecord(), getLiveTrackRecord()])
    .then(() => logger.info("Track record cache pre-warmed"))
    .catch((err) => logger.error("Track record pre-warm failed", err));

  // Same reasoning: the mutual-fund recommendation list fetches ~13 real
  // schemes from the AMFI feed on a cold cache — pre-warm it so neither the
  // Mutual Funds page nor a goal's fund suggestion pays that cost inline.
  getFundRecommendations()
    .then(() => logger.info("Fund recommendations cache pre-warmed"))
    .catch((err) => logger.error("Fund recommendations pre-warm failed", err));

  // Fundamentals are cached per-symbol for 6 hours (see TTL.fundamentals),
  // but the Screener fetches the whole reference universe in one request —
  // without this, whoever opens Screener first after a restart pays for
  // ~150 uncached fundamentals fetches inline (the actual cause of a slow
  // first screener load).
  runScreener({})
    .then(() => logger.info("Screener fundamentals cache pre-warmed"))
    .catch((err) => logger.error("Screener pre-warm failed", err));

  runInterval("alert-runner", env.alertIntervalMs, async () => {
    const result = await evaluateAllActiveUsers();
    return { usersChecked: result.users, triggered: result.triggered };
  });

  runInterval("signal-alert-runner", env.signalAlertIntervalMs, async () => {
    const result = await evaluateSignalAlertsForAllUsers();
    return { usersChecked: result.users, notified: result.notified };
  });

  // Check signal outcomes daily: fills in 5d/10d/20d WIN/LOSS for tracked BUY signals.
  // Runs every 24 hours so it catches the trading-day close each afternoon.
  runInterval("signal-outcome-checker", 24 * 60 * 60 * 1000, async () => {
    const { checked, resolved } = await checkPendingSignalOutcomes();
    return { usersChecked: 0, checked, resolved };
  });

  logger.info("Background jobs started", {
    alertIntervalSec: Math.round(env.alertIntervalMs / 1000),
    signalAlertIntervalMin: Math.round(env.signalAlertIntervalMs / 60000),
  });
}

/**
 * Signal Outcome Tracker
 *
 * Every time the scanner generates a BUY or STRONG BUY signal, we record it
 * in the SignalOutcome table. A background job (wired into scheduler.ts) then
 * checks back at 5 / 10 / 20 trading days and marks whether the trade would
 * have been a WIN, LOSS, or STOPPED_OUT.
 *
 * This gives us a live, real-money win-rate that the frontend can display.
 * Without it we're flying blind on whether the signals actually work.
 *
 * Table is created by: npx prisma db push  (run once after deploying schema)
 */

import { prisma } from "../prisma";
import { logger } from "../logger";
import { marketDataProvider } from "../providers";

// Minimum R:R ratio we consider a WIN at 5-day check
const MIN_WIN_PCT = 2.0; // stock must be +2% or more to count as WIN
const LOSS_THRESHOLD_PCT = -2.0; // -2% or worse counts as LOSS

export async function recordSignalOutcome(input: {
  symbol: string;
  signal: string;
  score: number;
  confidence: number;
  entryPrice: number;
  stopLoss?: number | null;
  targetMin?: number | null;
  targetMax?: number | null;
}): Promise<void> {
  // Only track actionable signals — HOLD/WAIT/REDUCE/SELL outcomes are less useful
  // for calibrating a trading system than BUY signals.
  if (!["BUY", "STRONG BUY"].includes(input.signal)) return;

  try {
    await prisma.$executeRaw`
      INSERT INTO "SignalOutcome" (
        id, symbol, signal, score, confidence,
        "entryPrice", "stopLoss", "targetMin", "targetMax", "generatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${input.symbol},
        ${input.signal},
        ${input.score},
        ${input.confidence},
        ${input.entryPrice},
        ${input.stopLoss ?? null},
        ${input.targetMin ?? null},
        ${input.targetMax ?? null},
        NOW()
      )
    `;
  } catch (err: any) {
    // Table may not exist yet (before prisma db push). Log once and move on —
    // this should never crash the scanner.
    if (err?.message?.includes('does not exist') || err?.message?.includes('relation')) {
      logger.warn('[signal-outcome] SignalOutcome table does not exist — run: npx prisma db push');
    } else {
      logger.error('[signal-outcome] Failed to record signal outcome', err);
    }
  }
}

/**
 * Called daily by the background scheduler.
 * Fills in 5d / 10d / 20d prices and computes WIN/LOSS/STOPPED_OUT.
 */
export async function checkPendingSignalOutcomes(): Promise<{ checked: number; resolved: number }> {
  let checked = 0;
  let resolved = 0;

  try {
    // Find all records where 5-day check is still pending and at least 5 calendar
    // days have elapsed (approximating trading days — weekends inflate this by ~40%,
    // which is conservative and acceptable).
    const pending = await prisma.$queryRaw<Array<{
      id: string;
      symbol: string;
      signal: string;
      entryPrice: number;
      stopLoss: number | null;
      targetMin: number | null;
      generatedAt: Date;
      outcome5d: string | null;
      outcome10d: string | null;
      outcome20d: string | null;
    }>>`
      SELECT id, symbol, signal, "entryPrice", "stopLoss", "targetMin",
             "generatedAt", "outcome5d", "outcome10d", "outcome20d"
      FROM "SignalOutcome"
      WHERE "checkedAt" IS NULL OR "outcome20d" IS NULL
        AND "generatedAt" < NOW() - INTERVAL '5 days'
      LIMIT 50
    `;

    for (const row of pending) {
      checked++;
      try {
        const quote = await marketDataProvider.getQuote(row.symbol);
        if (!quote?.price) continue;

        const currentPrice = quote.price;
        const daysSince = (Date.now() - row.generatedAt.getTime()) / (1000 * 60 * 60 * 24);
        const changePct = ((currentPrice - row.entryPrice) / row.entryPrice) * 100;

        const classifyOutcome = (pct: number, sl: number | null): string => {
          if (sl && currentPrice <= sl) return 'STOPPED_OUT';
          if (pct >= MIN_WIN_PCT) return 'WIN';
          if (pct <= LOSS_THRESHOLD_PCT) return 'LOSS';
          return 'PENDING';
        };

        const outcome = classifyOutcome(changePct, row.stopLoss);

        if (daysSince >= 5 && !row.outcome5d) {
          await prisma.$executeRaw`
            UPDATE "SignalOutcome"
            SET "price5d" = ${currentPrice}, "outcome5d" = ${outcome},
                "checkedAt" = NOW()
            WHERE id = ${row.id}
          `;
          resolved++;
        }
        if (daysSince >= 10 && !row.outcome10d) {
          await prisma.$executeRaw`
            UPDATE "SignalOutcome"
            SET "price10d" = ${currentPrice}, "outcome10d" = ${outcome},
                "checkedAt" = NOW()
            WHERE id = ${row.id}
          `;
          resolved++;
        }
        if (daysSince >= 20 && !row.outcome20d) {
          await prisma.$executeRaw`
            UPDATE "SignalOutcome"
            SET "price20d" = ${currentPrice}, "outcome20d" = ${outcome},
                "checkedAt" = NOW()
            WHERE id = ${row.id}
          `;
          resolved++;
        }
      } catch (innerErr) {
        logger.error(`[signal-outcome] Failed to check outcome for ${row.symbol}`, innerErr);
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('does not exist') || err?.message?.includes('relation')) {
      logger.warn('[signal-outcome] SignalOutcome table does not exist — run: npx prisma db push');
      return { checked: 0, resolved: 0 };
    }
    throw err;
  }

  return { checked, resolved };
}

/**
 * Returns the 5-day / 10-day win rate for BUY signals over the last 90 days.
 * Used by the frontend to display signal accuracy.
 */
export async function getSignalWinRate(): Promise<{
  winRate5d: number | null;
  winRate10d: number | null;
  winRate20d: number | null;
  totalSignals: number;
} | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      outcome5d: string | null;
      outcome10d: string | null;
      outcome20d: string | null;
    }>>`
      SELECT "outcome5d", "outcome10d", "outcome20d"
      FROM "SignalOutcome"
      WHERE signal IN ('BUY', 'STRONG BUY')
        AND "generatedAt" > NOW() - INTERVAL '90 days'
    `;

    if (rows.length === 0) return null;

    const rate = (field: 'outcome5d' | 'outcome10d' | 'outcome20d') => {
      const resolved = rows.filter(r => r[field] && r[field] !== 'PENDING');
      if (resolved.length === 0) return null;
      const wins = resolved.filter(r => r[field] === 'WIN').length;
      return Math.round((wins / resolved.length) * 100);
    };

    return {
      winRate5d: rate('outcome5d'),
      winRate10d: rate('outcome10d'),
      winRate20d: rate('outcome20d'),
      totalSignals: rows.length,
    };
  } catch {
    return null;
  }
}

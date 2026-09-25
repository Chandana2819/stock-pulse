// Daily track record of the user's REAL portfolio.
//
// Brokers (Zerodha Kite, Upstox) only report what you hold *now* — quantity
// and average price — not what the portfolio was worth on past days. So the
// only honest way to get a day-by-day record is to save one snapshot per
// trading day after the close and build the history forward from there.
//
// Only real holdings count (broker-synced, imported, manual). Simulated paper
// trades are excluded — this is a record of real money. INR holdings only.
import { prisma } from "../prisma";
import { logger } from "../logger";
import { marketDataProvider } from "../providers";
import { getEnrichedHoldings } from "./portfolio";
import { getIstTradingDay } from "../marketHours";

// 3:45 PM IST — 15 minutes after the close, so quotes reflect closing prices.
const SNAPSHOT_AFTER_MINUTES_IST = 15 * 60 + 45;

let tableReady: Promise<void> | null = null;

/**
 * Creates the table if it doesn't exist, matching exactly what `prisma db push`
 * would create for the PortfolioSnapshot model, so a later db push sees no diff.
 */
export function ensurePortfolioSnapshotTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          "investedInr" DOUBLE PRECISION NOT NULL,
          "valueInr" DOUBLE PRECISION NOT NULL,
          "holdingsCount" INTEGER NOT NULL,
          "niftyClose" DOUBLE PRECISION,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
        )`);
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date")`
      );
    })().catch((err) => {
      tableReady = null; // retry on the next call
      throw err;
    });
  }
  return tableReady;
}

/** Background job: save today's snapshot for every user with real holdings, once per trading day after the close. */
export async function takePortfolioSnapshots(now: Date = new Date()): Promise<{ users: number; saved: number }> {
  const { isoDate, isTradingDay, minutesIst } = getIstTradingDay(now);
  if (!isTradingDay || minutesIst < SNAPSHOT_AFTER_MINUTES_IST) return { users: 0, saved: 0 };
  await ensurePortfolioSnapshotTable();

  const owners = await prisma.holding.findMany({
    where: { source: { not: "SIMULATED" } },
    distinct: ["userId"],
    select: { userId: true },
  });
  if (owners.length === 0) return { users: 0, saved: 0 };

  let niftyClose: number | null = null;
  try {
    niftyClose = (await marketDataProvider.getQuote("^NSEI"))?.price ?? null;
  } catch {
    // saved without the benchmark rather than not at all
  }

  let saved = 0;
  for (const { userId } of owners) {
    try {
      const existing = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "PortfolioSnapshot" WHERE "userId" = ${userId} AND "date" = CAST(${isoDate} AS TIMESTAMP(3))
      `;
      if ((existing[0]?.n ?? 0) > 0) continue;

      const holdings = (await getEnrichedHoldings(userId)).filter((h) => h.source !== "SIMULATED" && h.currency === "INR");
      if (holdings.length === 0) continue;
      // A missing price would record a falsely low value — skip and retry on the next run instead.
      if (holdings.some((h) => h.value == null)) continue;

      const investedInr = holdings.reduce((s, h) => s + h.cost, 0);
      const valueInr = holdings.reduce((s, h) => s + (h.value ?? 0), 0);

      await prisma.$executeRaw`
        INSERT INTO "PortfolioSnapshot" ("id", "userId", "date", "investedInr", "valueInr", "holdingsCount", "niftyClose", "createdAt")
        VALUES (gen_random_uuid()::text, ${userId}, CAST(${isoDate} AS TIMESTAMP(3)), ${investedInr}, ${valueInr}, ${holdings.length}, ${niftyClose}, NOW())
        ON CONFLICT ("userId", "date") DO NOTHING
      `;
      saved++;
    } catch (err) {
      logger.error("[portfolio-snapshot] Failed to save snapshot", err, { userId });
    }
  }
  return { users: owners.length, saved };
}

export type SnapshotRow = {
  date: Date;
  investedInr: number;
  valueInr: number;
  holdingsCount: number;
  niftyClose: number | null;
};

export type PortfolioTrackRecordDay = {
  date: string; // YYYY-MM-DD
  investedInr: number;
  valueInr: number;
  pnlInr: number; // value - invested
  pnlPct: number | null; // pnl / invested
  dayChangeInr: number | null; // change in P&L vs the previous snapshot
  dayReturnPct: number | null;
  cumulativeReturnPct: number; // chained daily returns since the first snapshot
  niftyDayReturnPct: number | null;
  niftyCumulativeReturnPct: number | null;
};

export type PortfolioTrackRecordPeriod = {
  key: string; // week: Monday's date (YYYY-MM-DD); month: YYYY-MM
  start: string; // first snapshot date in the period
  end: string; // last snapshot date in the period
  tradingDays: number;
  endInvestedInr: number;
  endValueInr: number;
  pnlChangeInr: number; // sum of that period's daily P&L changes
  returnPct: number | null; // daily returns chained within the period
  niftyReturnPct: number | null;
};

export type PortfolioTrackRecord = {
  days: PortfolioTrackRecordDay[]; // oldest first
  weekly: PortfolioTrackRecordPeriod[]; // oldest first
  monthly: PortfolioTrackRecordPeriod[]; // oldest first
  summary: {
    daysTracked: number;
    since: string | null;
    portfolioReturnPct: number | null;
    niftyReturnPct: number | null;
    currentPnlInr: number | null;
    currentPnlPct: number | null;
  };
};

const round2 = (n: number) => Number(n.toFixed(2));

/** Monday of the week containing an ISO date (YYYY-MM-DD), as YYYY-MM-DD. */
export function weekKey(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Rolls daily rows up into weeks or months. A day's return belongs to the
 * period it lands in (Monday's return covers the Friday -> Monday move), and
 * returns inside a period are chained, not added. A period whose only day is
 * the very first snapshot has nothing to compare against, so its return is null.
 */
export function aggregatePeriods(days: PortfolioTrackRecordDay[], keyOf: (isoDate: string) => string): PortfolioTrackRecordPeriod[] {
  const groups = new Map<string, PortfolioTrackRecordDay[]>();
  for (const d of days) {
    const k = keyOf(d.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  return Array.from(groups.entries()).map(([key, group]) => {
    const chain = (vals: (number | null)[]) => {
      const present = vals.filter((v): v is number => v != null);
      if (present.length === 0) return null;
      return round2((present.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100);
    };
    const last = group[group.length - 1];
    return {
      key,
      start: group[0].date,
      end: last.date,
      tradingDays: group.length,
      endInvestedInr: last.investedInr,
      endValueInr: last.valueInr,
      pnlChangeInr: round2(group.reduce((sum, d) => sum + (d.dayChangeInr ?? 0), 0)),
      returnPct: chain(group.map((d) => d.dayReturnPct)),
      niftyReturnPct: chain(group.map((d) => d.niftyDayReturnPct)),
    };
  });
}

/**
 * Turns raw daily snapshots into a track record.
 *
 * Adding money (buying more) raises value AND invested by the same amount, so
 * a day's performance is the change in P&L (value - invested), not the change
 * in value — otherwise every purchase would look like a gain. Daily returns
 * are that P&L change over the previous day's value, chained together, which
 * is directly comparable to NIFTY's own chained daily moves.
 *
 * Known limit: when you sell at a profit, that profit leaves the holdings, so
 * it shows as a drop in P&L that day. The broker doesn't report sells with
 * proceeds, so this can't be separated out.
 */
export function buildPortfolioTrackRecord(rows: SnapshotRow[]): PortfolioTrackRecord {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const days: PortfolioTrackRecordDay[] = [];
  let cumulative = 1;
  const firstNifty = sorted.find((r) => r.niftyClose != null)?.niftyClose ?? null;

  sorted.forEach((r, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const pnl = r.valueInr - r.investedInr;
    let dayChange: number | null = null;
    let dayReturn: number | null = null;
    if (prev) {
      dayChange = pnl - (prev.valueInr - prev.investedInr);
      if (prev.valueInr > 0) {
        dayReturn = (dayChange / prev.valueInr) * 100;
        cumulative *= 1 + dayReturn / 100;
      }
    }
    const niftyDay =
      prev && prev.niftyClose && r.niftyClose ? ((r.niftyClose - prev.niftyClose) / prev.niftyClose) * 100 : null;
    const niftyCum = firstNifty && r.niftyClose ? ((r.niftyClose - firstNifty) / firstNifty) * 100 : null;

    days.push({
      date: r.date.toISOString().slice(0, 10),
      investedInr: round2(r.investedInr),
      valueInr: round2(r.valueInr),
      pnlInr: round2(pnl),
      pnlPct: r.investedInr > 0 ? round2((pnl / r.investedInr) * 100) : null,
      dayChangeInr: dayChange != null ? round2(dayChange) : null,
      dayReturnPct: dayReturn != null ? round2(dayReturn) : null,
      cumulativeReturnPct: round2((cumulative - 1) * 100),
      niftyDayReturnPct: niftyDay != null ? round2(niftyDay) : null,
      niftyCumulativeReturnPct: niftyCum != null ? round2(niftyCum) : null,
    });
  });

  const last = days[days.length - 1];
  return {
    days,
    weekly: aggregatePeriods(days, weekKey),
    monthly: aggregatePeriods(days, (d) => d.slice(0, 7)),
    summary: {
      daysTracked: days.length,
      since: days[0]?.date ?? null,
      portfolioReturnPct: days.length > 1 ? last.cumulativeReturnPct : null,
      niftyReturnPct: days.length > 1 ? last.niftyCumulativeReturnPct : null,
      currentPnlInr: last ? last.pnlInr : null,
      currentPnlPct: last ? last.pnlPct : null,
    },
  };
}

/** Reads a user's snapshots (last ~1 year) and builds the track record. */
export async function getPortfolioTrackRecord(userId: string): Promise<PortfolioTrackRecord> {
  await ensurePortfolioSnapshotTable();
  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT "date", "investedInr", "valueInr", "holdingsCount", "niftyClose"
    FROM "PortfolioSnapshot"
    WHERE "userId" = ${userId} AND "date" >= NOW() - INTERVAL '400 days'
    ORDER BY "date" ASC
  `;
  return buildPortfolioTrackRecord(rows);
}

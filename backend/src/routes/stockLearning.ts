import express from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ApiError } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { getEnrichedHoldings } from "../lib/services/portfolio";
import { marketDataProvider } from "../lib/providers";
import { lookupUniverse } from "../lib/universe";
import {
  computeMonthlyOverview,
  computeSignalJourney,
  computeScoreConfidenceMovement,
  computeReasonsAnalysis,
  computeWarningsAnalysis,
  computeEntryStopTargetEvolution,
  computeRiskReview,
  computeChangeSummary,
  computeHistoricalValidation,
  computeWhatToMonitor,
  buildMasterMonthlyReview,
  type DailySignalRow,
} from "../lib/services/stockLearning";
import { evaluatePrediction, summarize, evaluateLogicHealth, type Candle, type EvaluatedPrediction } from "../lib/services/predictionEvaluation";

const router = express.Router();
router.use(requireAuth);

/** Strip the .NS/.BO provider suffix so an uploaded ticker matches a Holding's display symbol either way. */
function canonicalTicker(t: string): string {
  return t.toUpperCase().trim().replace(/\.(NS|BO)$/, "");
}

function parseTradingDate(input: unknown): Date {
  if (typeof input !== "string" || !input.trim()) throw ApiError.badRequest("tradingDate is required (YYYY-MM-DD)");
  const d = new Date(`${input.trim()}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`Invalid tradingDate: "${input}"`);
  return d;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

// ─────────────────────────  DAILY IMPORT  ─────────────────────────

router.post(
  "/daily-import",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { fileName, tradingDate: rawDate, rows, replace, logicVersion: rawLogicVersion } = req.body ?? {};
    const logicVersion = typeof rawLogicVersion === "string" && rawLogicVersion.trim() ? rawLogicVersion.trim() : "v1";

    const tradingDate = parseTradingDate(rawDate);
    if (!Array.isArray(rows) || rows.length === 0) throw ApiError.badRequest("The file has no rows to import.");
    if (typeof fileName !== "string" || !fileName.trim()) throw ApiError.badRequest("fileName is required");

    const cleanRows = rows
      .map((r: any) => ({
        ticker: str(r.ticker),
        stockName: str(r.stockName),
        price: num(r.price),
        signal: str(r.signal),
        score: num(r.score),
        confidence: num(r.confidence),
        risk: str(r.risk),
        entryZoneMin: num(r.entryZoneMin),
        entryZoneMax: num(r.entryZoneMax),
        stopLoss: num(r.stopLoss),
        targetRangeMin: num(r.targetRangeMin),
        targetRangeMax: num(r.targetRangeMax),
        reasons: strArray(r.reasons),
        warnings: strArray(r.warnings),
        rsi: num(r.rsi),
        macd: num(r.macd),
        trend: str(r.trend),
        volume: num(r.volume),
        raw: r.raw ?? r,
      }))
      .filter((r) => r.ticker);

    if (cleanRows.length === 0) throw ApiError.badRequest("No row had a recognizable stock symbol/ticker column.");

    const existing = await prisma.dailyImport.findUnique({ where: { userId_tradingDate: { userId, tradingDate } } });
    if (existing && !replace) {
      throw ApiError.conflict(
        `Data for ${rawDate} was already uploaded ("${existing.fileName}", ${existing.rowCount} rows). Re-upload with "replace" if this file supersedes it.`
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.dailyImport.delete({ where: { id: existing.id } }); // cascades to its DailyStockSignal rows
      }
      const dailyImport = await tx.dailyImport.create({
        data: { userId, fileName: fileName.trim(), tradingDate, rowCount: cleanRows.length, status: "COMPLETED" },
      });
      await tx.dailyStockSignal.createMany({
        data: cleanRows.map((r) => ({
          dailyImportId: dailyImport.id,
          userId,
          tradingDate,
          ticker: canonicalTicker(r.ticker!),
          stockName: r.stockName,
          price: r.price,
          signal: r.signal,
          score: r.score,
          confidence: r.confidence,
          risk: r.risk,
          entryZoneMin: r.entryZoneMin,
          entryZoneMax: r.entryZoneMax,
          stopLoss: r.stopLoss,
          targetRangeMin: r.targetRangeMin,
          targetRangeMax: r.targetRangeMax,
          reasons: JSON.stringify(r.reasons),
          warnings: JSON.stringify(r.warnings),
          rsi: r.rsi,
          macd: r.macd,
          trend: r.trend,
          volume: r.volume,
          logicVersion,
          rawData: JSON.stringify(r.raw ?? {}),
        })),
      });
      return dailyImport;
    });

    return res.json({ success: true, import: created, rowCount: cleanRows.length, replaced: !!existing });
  })
);

router.get(
  "/daily-imports",
  asyncHandler(async (req, res) => {
    const imports = await prisma.dailyImport.findMany({
      where: { userId: req.user!.id },
      orderBy: { tradingDate: "desc" },
      select: { id: true, fileName: true, tradingDate: true, rowCount: true, status: true, errorMessage: true, createdAt: true },
    });
    return res.json({ imports, lastUpload: imports[0] ?? null });
  })
);

router.delete(
  "/daily-imports/:id",
  asyncHandler(async (req, res) => {
    const imp = await prisma.dailyImport.findUnique({ where: { id: req.params.id } });
    if (!imp || imp.userId !== req.user!.id) throw ApiError.notFound("Import not found");
    await prisma.dailyImport.delete({ where: { id: imp.id } });
    return res.json({ success: true });
  })
);

// ─────────────────────────  MASTER HOLDINGS TABLE  ─────────────────────────

router.get(
  "/holdings-review",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const holdings = await getEnrichedHoldings(userId);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const results = await Promise.all(
      holdings.map(async (h) => {
        const ticker = canonicalTicker(h.displaySym || h.stock);
        const monthRows = await prisma.dailyStockSignal.findMany({
          where: { userId, ticker, tradingDate: { gte: monthStart, lt: monthEnd } },
          orderBy: { tradingDate: "asc" },
        });
        const latest = monthRows[monthRows.length - 1] ?? null;
        const earliest = monthRows[0] ?? null;

        const monthlyChangePct =
          earliest?.price != null && h.currentPrice != null && earliest.price !== 0 ? ((h.currentPrice - earliest.price) / earliest.price) * 100 : null;

        const signalCounts: Record<string, number> = {};
        for (const r of monthRows) if (r.signal) signalCounts[r.signal] = (signalCounts[r.signal] ?? 0) + 1;
        const mostFrequentSignal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        let signalChanges = 0;
        const withSignal = monthRows.filter((r) => r.signal);
        for (let i = 1; i < withSignal.length; i++) if (withSignal[i].signal !== withSignal[i - 1].signal) signalChanges++;

        const scores = monthRows.map((r) => r.score).filter((s): s is number => s != null);
        const confidences = monthRows.map((r) => r.confidence).filter((c): c is number => c != null);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

        return {
          ticker,
          displaySym: h.displaySym,
          exchange: h.exchange,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          currentPrice: h.currentPrice,
          cost: h.cost,
          value: h.value,
          pl: h.pl,
          plPct: h.plPct,
          monthlyChangePct,
          signalTrend: mostFrequentSignal ? { mostFrequent: mostFrequentSignal, changes: signalChanges, counts: signalCounts } : null,
          avgScore,
          avgConfidence,
          currentRisk: latest?.risk ?? null,
        };
      })
    );

    return res.json({ holdings: results });
  })
);

// ─────────────────────────  PER-STOCK RAW HISTORY  ─────────────────────────

function toDailySignalRow(r: any): DailySignalRow {
  return {
    tradingDate: r.tradingDate,
    price: r.price,
    signal: r.signal,
    score: r.score,
    confidence: r.confidence,
    risk: r.risk,
    entryZoneMin: r.entryZoneMin,
    entryZoneMax: r.entryZoneMax,
    stopLoss: r.stopLoss,
    targetRangeMin: r.targetRangeMin,
    targetRangeMax: r.targetRangeMax,
    reasons: r.reasons ? JSON.parse(r.reasons) : [],
    warnings: r.warnings ? JSON.parse(r.warnings) : [],
    rsi: r.rsi,
    macd: r.macd,
    trend: r.trend,
    volume: r.volume,
  };
}

router.get(
  "/stock/:ticker/history",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const ticker = canonicalTicker(req.params.ticker);
    const { month, year } = req.query;

    const where: any = { userId, ticker };
    if (month && year) {
      const m = Number(month);
      const y = Number(year);
      where.tradingDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    }

    const rows = await prisma.dailyStockSignal.findMany({ where, orderBy: { tradingDate: "asc" } });
    const holding = (await getEnrichedHoldings(userId)).find((h) => canonicalTicker(h.displaySym || h.stock) === ticker) ?? null;

    return res.json({ ticker, holding, history: rows });
  })
);

router.get(
  "/stock/:ticker/available-months",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const ticker = canonicalTicker(req.params.ticker);
    const rows = await prisma.dailyStockSignal.findMany({ where: { userId, ticker }, select: { tradingDate: true }, orderBy: { tradingDate: "asc" } });
    const months = Array.from(new Set(rows.map((r) => `${r.tradingDate.getUTCFullYear()}-${r.tradingDate.getUTCMonth() + 1}`)));
    return res.json({ months });
  })
);

// ─────────────────────────  MASTER CLOSE-UP REVIEW  ─────────────────────────

router.get(
  "/stock/:ticker/master-review",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const ticker = canonicalTicker(req.params.ticker);
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest("month and year query params are required");

    const [monthRowsRaw, allRowsRaw, holdings, earliestBuyTx] = await Promise.all([
      prisma.dailyStockSignal.findMany({
        where: { userId, ticker, tradingDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } },
        orderBy: { tradingDate: "asc" },
      }),
      prisma.dailyStockSignal.findMany({ where: { userId, ticker }, orderBy: { tradingDate: "asc" } }),
      getEnrichedHoldings(userId),
      prisma.transaction.findFirst({ where: { userId, stock: { contains: ticker }, type: "BUY" }, orderBy: { createdAt: "asc" } }),
    ]);

    const prevDate = new Date(Date.UTC(year, month - 2, 1));
    const prevMonth = prevDate.getUTCMonth() + 1;
    const prevYear = prevDate.getUTCFullYear();
    const prevRowsRaw = await prisma.dailyStockSignal.findMany({
      where: { userId, ticker, tradingDate: { gte: new Date(Date.UTC(prevYear, prevMonth - 1, 1)), lt: new Date(Date.UTC(prevYear, prevMonth, 1)) } },
      orderBy: { tradingDate: "asc" },
    });

    const holding = holdings.find((h) => canonicalTicker(h.displaySym || h.stock) === ticker) ?? null;
    const holdingCtx = holding ? { avgPrice: holding.avgPrice, quantity: holding.quantity } : null;

    const monthRows = monthRowsRaw.map(toDailySignalRow);
    const allRows = allRowsRaw.map(toDailySignalRow);
    const prevRows = prevRowsRaw.map(toDailySignalRow);

    if (monthRows.length === 0) {
      return res.json({
        ticker,
        month,
        year,
        tradingDays: 0,
        message: `No StockSignals data available for ${ticker} in ${month}/${year}. Upload daily files covering this month first.`,
      });
    }

    const myPosition = holding
      ? {
          quantity: holding.quantity,
          avgPrice: holding.avgPrice,
          currentPrice: holding.currentPrice,
          invested: holding.cost,
          currentValue: holding.value,
          pl: holding.pl,
          plPct: holding.plPct,
          purchaseDate: earliestBuyTx?.createdAt ?? null,
          holdingPeriodDays: earliestBuyTx ? Math.floor((Date.now() - earliestBuyTx.createdAt.getTime()) / 86400000) : null,
        }
      : null;

    const overview = computeMonthlyOverview(monthRows, month, year, holdingCtx);
    const prevOverview = prevRows.length > 0 ? computeMonthlyOverview(prevRows, prevMonth, prevYear, holdingCtx) : null;
    const journey = computeSignalJourney(monthRows);
    const scoreConfidence = computeScoreConfidenceMovement(monthRows);
    const reasonsAnalysis = computeReasonsAnalysis(monthRows);
    const warningsAnalysis = computeWarningsAnalysis(monthRows);
    const prevWarningsAnalysis = prevRows.length > 0 ? computeWarningsAnalysis(prevRows) : null;
    const evolution = computeEntryStopTargetEvolution(monthRows);
    const riskReview = computeRiskReview(monthRows);
    const changeSummary = computeChangeSummary(overview, prevOverview, warningsAnalysis, prevWarningsAnalysis);
    const historicalValidation = computeHistoricalValidation(allRows);
    const monitor = computeWhatToMonitor(overview, warningsAnalysis, evolution);
    const masterReview = buildMasterMonthlyReview(overview, journey, changeSummary, monitor);

    const priceVsSignal = monthRows.map((r, i) => ({
      date: r.tradingDate.toISOString().slice(0, 10),
      price: r.price,
      signal: r.signal,
    }));

    return res.json({
      ticker,
      month,
      year,
      tradingDays: monthRows.length,
      myPosition,
      overview,
      previousOverview: prevOverview,
      journey,
      scoreConfidence,
      priceVsSignal,
      reasonsAnalysis,
      warningsAnalysis,
      evolution,
      riskReview,
      changeSummary,
      historicalValidation,
      monitor,
      masterReview,
    });
  })
);

// ═══════════════════════════════════════════════════════════════════════
// PREDICTION LEARNING — historical prediction record + real-data evaluation
// ═══════════════════════════════════════════════════════════════════════
// Unlike the per-holding Master Review above, this operates over EVERY
// stored prediction (the whole uploaded universe), answering "did BullHawk's
// predictions actually work?" using real OHLC candles. Nothing here is
// invented: a prediction with no target/stop is INSUFFICIENT_DATA, a
// same-day double-cross is AMBIGUOUS, and an unresolved window is PENDING.

const DEFAULT_HORIZON = 10;

function toProviderSymbol(ticker: string): string {
  const uni = lookupUniverse(ticker);
  if (uni) return uni.symbol;
  return `${ticker}.NS`;
}

/** Fetches one wide candle range per unique ticker (cached inside the provider) and evaluates every row against it. */
async function evaluateRows(rows: Awaited<ReturnType<typeof prisma.dailyStockSignal.findMany>>, horizon: number): Promise<EvaluatedPrediction[]> {
  const uniqueTickers = Array.from(new Set(rows.map((r) => r.ticker)));
  const candleMap = new Map<string, Candle[]>();
  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      try {
        const candles = await marketDataProvider.getCandles(toProviderSymbol(ticker), "1Y");
        candleMap.set(ticker, candles);
      } catch {
        candleMap.set(ticker, []);
      }
    })
  );

  return rows.map((r) => {
    const candles = candleMap.get(r.ticker) ?? [];
    const evaluation = evaluatePrediction(
      { action: r.signal, entryZoneMin: r.entryZoneMin, entryZoneMax: r.entryZoneMax, stopLoss: r.stopLoss, targetRangeMin: r.targetRangeMin, targetRangeMax: r.targetRangeMax, tradingDate: r.tradingDate },
      candles,
      horizon
    );
    return {
      ticker: r.ticker,
      action: r.signal,
      score: r.score,
      confidence: r.confidence,
      risk: r.risk,
      sector: lookupUniverse(r.ticker)?.sector ?? null,
      logicVersion: r.logicVersion,
      reasons: r.reasons ? JSON.parse(r.reasons) : [],
      evaluation,
    };
  });
}

function dateRangeFromQuery(query: any): { gte?: Date; lt?: Date } {
  if (query.week) {
    const start = new Date(`${query.week}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw ApiError.badRequest("Invalid week start date");
    const end = new Date(start.getTime() + 7 * 86400000);
    return { gte: start, lt: end };
  }
  if (query.month && query.year) {
    const m = Number(query.month);
    const y = Number(query.year);
    return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  return {};
}

router.get(
  "/predictions",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    const range = dateRangeFromQuery(req.query);

    const where: any = { userId };
    if (range.gte) where.tradingDate = { gte: range.gte, lt: range.lt };
    if (req.query.ticker) where.ticker = canonicalTicker(String(req.query.ticker));
    if (req.query.action) where.signal = String(req.query.action).toUpperCase();
    if (req.query.logicVersion) where.logicVersion = String(req.query.logicVersion);

    const rows = await prisma.dailyStockSignal.findMany({ where, orderBy: { tradingDate: "desc" }, take: 500 });
    let evaluated = await evaluateRows(rows, horizon);

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      evaluated = evaluated.filter((p) => p.evaluation.status === status);
    }

    return res.json({ predictions: evaluated, horizon, count: evaluated.length });
  })
);

router.get(
  "/predictions/:id",
  asyncHandler(async (req, res) => {
    const row = await prisma.dailyStockSignal.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.user!.id) throw ApiError.notFound("Prediction not found");

    const candles = await marketDataProvider.getCandles(toProviderSymbol(row.ticker), "1Y").catch(() => [] as Candle[]);
    const predictionInput = { action: row.signal, entryZoneMin: row.entryZoneMin, entryZoneMax: row.entryZoneMax, stopLoss: row.stopLoss, targetRangeMin: row.targetRangeMin, targetRangeMax: row.targetRangeMax, tradingDate: row.tradingDate };
    const evaluations = [5, 10, 20].map((h) => evaluatePrediction(predictionInput, candles, h));

    return res.json({
      prediction: {
        ticker: row.ticker,
        stockName: row.stockName,
        sector: lookupUniverse(row.ticker)?.sector ?? null,
        action: row.signal,
        score: row.score,
        confidence: row.confidence,
        risk: row.risk,
        entryZoneMin: row.entryZoneMin,
        entryZoneMax: row.entryZoneMax,
        stopLoss: row.stopLoss,
        targetRangeMin: row.targetRangeMin,
        targetRangeMax: row.targetRangeMax,
        reasons: row.reasons ? JSON.parse(row.reasons) : [],
        warnings: row.warnings ? JSON.parse(row.warnings) : [],
        tradingDate: row.tradingDate,
        logicVersion: row.logicVersion,
      },
      evaluations,
    });
  })
);

router.get(
  "/review/weekly",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    if (!req.query.week) throw ApiError.badRequest("week (YYYY-MM-DD, the Monday of the target week) is required");
    const range = dateRangeFromQuery(req.query);

    const rows = await prisma.dailyStockSignal.findMany({ where: { userId, tradingDate: { gte: range.gte, lt: range.lt } } });
    const evaluated = await evaluateRows(rows, horizon);

    const byAction: Record<string, ReturnType<typeof summarize>> = {};
    for (const action of Array.from(new Set(evaluated.map((p) => p.action).filter(Boolean))) as string[]) {
      byAction[action] = summarize(evaluated.filter((p) => p.action === action));
    }

    return res.json({ week: req.query.week, horizon, overall: summarize(evaluated), byAction, tradingDaysUploaded: Array.from(new Set(rows.map((r) => r.tradingDate.toISOString().slice(0, 10)))).length });
  })
);

router.get(
  "/review/monthly",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest("month and year are required");

    const range = dateRangeFromQuery({ month, year });
    const rows = await prisma.dailyStockSignal.findMany({ where: { userId, tradingDate: { gte: range.gte, lt: range.lt } } });
    const evaluated = await evaluateRows(rows, horizon);

    const byAction: Record<string, ReturnType<typeof summarize>> = {};
    for (const action of Array.from(new Set(evaluated.map((p) => p.action).filter(Boolean))) as string[]) {
      byAction[action] = summarize(evaluated.filter((p) => p.action === action));
    }

    const scoreRanges: [string, (s: number | null) => boolean][] = [
      ["80-100", (s) => s != null && s >= 80],
      ["60-79", (s) => s != null && s >= 60 && s < 80],
      ["Below 60", (s) => s != null && s < 60],
    ];
    const byScoreRange: Record<string, ReturnType<typeof summarize>> = {};
    for (const [label, test] of scoreRanges) byScoreRange[label] = summarize(evaluated.filter((p) => test(p.score)));

    const confidenceRanges: [string, (c: number | null) => boolean][] = [
      ["80-100%", (c) => c != null && c >= 80],
      ["60-79%", (c) => c != null && c >= 60 && c < 80],
      ["Below 60%", (c) => c != null && c < 60],
    ];
    const byConfidenceRange: Record<string, ReturnType<typeof summarize>> = {};
    for (const [label, test] of confidenceRanges) byConfidenceRange[label] = summarize(evaluated.filter((p) => test(p.confidence)));

    const byRisk: Record<string, ReturnType<typeof summarize>> = {};
    for (const risk of Array.from(new Set(evaluated.map((p) => p.risk).filter(Boolean))) as string[]) {
      byRisk[risk] = summarize(evaluated.filter((p) => p.risk === risk));
    }

    const bySector: Record<string, ReturnType<typeof summarize>> = {};
    for (const sector of Array.from(new Set(evaluated.map((p) => p.sector).filter(Boolean))) as string[]) {
      bySector[sector] = summarize(evaluated.filter((p) => p.sector === sector));
    }

    // Prior month, for the logic-health verdict.
    const prevDate = new Date(Date.UTC(year, month - 2, 1));
    const prevRange = dateRangeFromQuery({ month: prevDate.getUTCMonth() + 1, year: prevDate.getUTCFullYear() });
    const prevRows = await prisma.dailyStockSignal.findMany({ where: { userId, tradingDate: { gte: prevRange.gte, lt: prevRange.lt } } });
    const prevEvaluated = prevRows.length > 0 ? await evaluateRows(prevRows, horizon) : [];
    const overall = summarize(evaluated);
    const priorOverall = prevRows.length > 0 ? summarize(prevEvaluated) : null;
    const logicVerdict = evaluateLogicHealth(overall, priorOverall);

    return res.json({ month, year, horizon, overall, byAction, byScoreRange, byConfidenceRange, byRisk, bySector, logicVerdict, priorMonth: priorOverall });
  })
);

router.get(
  "/logic-performance",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    const rows = await prisma.dailyStockSignal.findMany({ where: { userId }, take: 2000 });
    const evaluated = await evaluateRows(rows, horizon);

    const versions = Array.from(new Set(evaluated.map((p) => p.logicVersion)));
    const performance = versions.map((version) => {
      const subset = evaluated.filter((p) => p.logicVersion === version);
      const s = summarize(subset);
      return { logicVersion: version, ...s, failureRate: s.targetHit + s.stopLossHit > 0 ? (s.stopLossHit / (s.targetHit + s.stopLossHit)) * 100 : null };
    });

    return res.json({ horizon, versions: performance });
  })
);

router.get(
  "/failure-analysis",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    const range = dateRangeFromQuery(req.query);
    const where: any = { userId };
    if (range.gte) where.tradingDate = { gte: range.gte, lt: range.lt };

    const rows = await prisma.dailyStockSignal.findMany({ where, take: 2000 });
    const evaluated = await evaluateRows(rows, horizon);
    const failures = evaluated.filter((p) => p.evaluation.status === "STOP_LOSS_HIT");
    const successes = evaluated.filter((p) => p.evaluation.status === "TARGET_HIT");

    const reasonCounts = new Map<string, number>();
    for (const f of failures) for (const reason of f.reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    const commonFailureReasons = Array.from(reasonCounts.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    const highConfidenceFailures = failures.filter((p) => p.confidence != null && p.confidence >= 80).length;
    const highScoreFailures = failures.filter((p) => p.score != null && p.score >= 80).length;

    const sectorFailureCounts = new Map<string, number>();
    for (const f of failures) if (f.sector) sectorFailureCounts.set(f.sector, (sectorFailureCounts.get(f.sector) ?? 0) + 1);
    const failuresBySector = Array.from(sectorFailureCounts.entries()).map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count);

    const reasonSuccessCounts = new Map<string, number>();
    for (const s of successes) for (const reason of s.reasons) reasonSuccessCounts.set(reason, (reasonSuccessCounts.get(reason) ?? 0) + 1);
    const commonSuccessReasons = Array.from(reasonSuccessCounts.entries()).map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    return res.json({
      horizon,
      totalEvaluated: evaluated.length,
      totalFailures: failures.length,
      totalSuccesses: successes.length,
      commonFailureReasons,
      commonSuccessReasons,
      highConfidenceFailures,
      highScoreFailures,
      failuresBySector,
    });
  })
);

router.get(
  "/timeline",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const horizon = req.query.horizon ? Number(req.query.horizon) : DEFAULT_HORIZON;
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest("month and year are required");

    const range = dateRangeFromQuery({ month, year });
    const rows = await prisma.dailyStockSignal.findMany({ where: { userId, tradingDate: { gte: range.gte, lt: range.lt } }, orderBy: { tradingDate: "asc" } });
    const evaluated = await evaluateRows(rows, horizon);

    const byDate = new Map<string, EvaluatedPrediction[]>();
    for (const p of evaluated) {
      const row = rows.find((r) => r.ticker === p.ticker && r.logicVersion === p.logicVersion);
      const dateKey = row?.tradingDate.toISOString().slice(0, 10) ?? "unknown";
      const list = byDate.get(dateKey) ?? [];
      list.push(p);
      byDate.set(dateKey, list);
    }

    const timeline = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, preds]) => ({
        date,
        totalPredictions: preds.length,
        targetHit: preds.filter((p) => p.evaluation.status === "TARGET_HIT").length,
        stopLossHit: preds.filter((p) => p.evaluation.status === "STOP_LOSS_HIT").length,
        pending: preds.filter((p) => p.evaluation.status === "PENDING").length,
        expired: preds.filter((p) => p.evaluation.status === "EXPIRED").length,
      }));

    return res.json({ month, year, horizon, timeline });
  })
);

export default router;

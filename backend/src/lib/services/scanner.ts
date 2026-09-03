import { prisma } from "../prisma";
import { marketDataProvider, newsProvider } from "../providers";
import { UNIVERSE, lookupUniverse } from "../universe";
import { computeIndicators, pctChange } from "../indicators";
import { computeMarketRisk } from "../engine/marketRisk";
import { RecommendationEngine, type SignalAction } from "./recommendationEngine";
import { getSectorChangeForKey } from "./market";

function directionBucket(action: string): "BUY" | "SELL" | "HOLD" | "WAIT" {
  if (action.includes("BUY")) return "BUY";
  if (action.includes("SELL") || action === "REDUCE") return "SELL";
  if (action === "HOLD") return "HOLD";
  return "WAIT";
}

export async function backfillStock(symbol: string): Promise<boolean> {
  try {
    console.log(`[scanner] Starting backfill for ${symbol}...`);
    const candles = await marketDataProvider.getCandles(symbol, "5Y");
    
    if (candles.length === 0) {
      console.warn(`[scanner] No historical candles returned for ${symbol}`);
      return false;
    }

    const priceData = candles
      .filter((c) => c.close > 0 && c.high >= c.low)
      .map((c) => {
        const d = new Date(c.time * 1000);
        d.setUTCHours(0, 0, 0, 0);
        return {
          symbol,
          date: d,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        };
      });

    if (priceData.length > 0) {
      await prisma.stockPrice.createMany({
        data: priceData,
        skipDuplicates: true,
      });
      console.log(`[scanner] Successfully backfilled ${priceData.length} candles for ${symbol}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[scanner] Failed to backfill ${symbol}:`, err);
    return false;
  }
}

export async function runMarketScan(): Promise<void> {
  const syncStart = new Date();
  console.log(`[scanner] Starting full market scan at ${syncStart.toISOString()}...`);
  
  let successCount = 0;
  let failedCount = 0;
  
  const advancesList: string[] = [];
  const declinesList: string[] = [];
  
  const scanResults: Array<{
    symbol: string;
    price: number;
    prevClose: number | null;
    changePct: number | null;
  }> = [];

  // Check history depth for every symbol concurrently — these are cheap local
  // DB reads (no external API involved), so unlike the backfill/quote calls
  // below there's no rate limit to respect in batching all of them at once.
  // Sequentially awaiting 138 of these one at a time was the single biggest
  // cost in a full scan once the DB itself is remote (each round trip pays
  // real network latency even for a trivial COUNT).
  const historyCounts = await Promise.all(
    UNIVERSE.map(async (item) => {
      try {
        return { symbol: item.symbol, count: await prisma.stockPrice.count({ where: { symbol: item.symbol } }) };
      } catch (err) {
        console.error(`[scanner] Error checking history depth for ${item.symbol}:`, err);
        return { symbol: item.symbol, count: 30 }; // assume sufficient; don't force a backfill on a transient DB error
      }
    })
  );
  const needsBackfill = historyCounts.filter((c) => c.count < 30).map((c) => c.symbol);
  for (const symbol of needsBackfill) {
    try {
      const ok = await backfillStock(symbol);
      if (!ok) failedCount++;
    } catch (err) {
      console.error(`[scanner] Error backfilling ${symbol} in Phase 1:`, err);
      failedCount++;
    }
  }

  // Bulk-fetch today's quotes in one call — getQuotes() already batches
  // requests (12 concurrent at a time, see yahooProvider.ts) instead of this
  // loop opening one socket per symbol and waiting on it sequentially, which
  // is what made a 138-symbol scan take several minutes end to end.
  const liveQuotes = await marketDataProvider.getQuotes(UNIVERSE.map((u) => u.symbol));

  // These upserts were the other half of the "sequential remote-DB round
  // trip" cost — each one only needs the quote already fetched above, so
  // there's nothing to wait on between symbols. Same reasoning as the history
  // count pass: safe to fire all of them at once (JS's event loop makes the
  // shared array/counter mutations below race-free even though they run
  // concurrently — nothing here awaits mid-mutation).
  await Promise.all(
    UNIVERSE.map(async (item) => {
      try {
        const quote = liveQuotes[item.symbol];
        if (quote && quote.price > 0) {
          const todayDate = new Date();
          todayDate.setUTCHours(0, 0, 0, 0);

          await prisma.stockPrice.upsert({
            where: {
              symbol_date: { symbol: item.symbol, date: todayDate }
            },
            update: {
              open: quote.open ?? quote.price,
              high: quote.dayHigh ?? quote.price,
              low: quote.dayLow ?? quote.price,
              close: quote.price,
              volume: quote.volume ?? 0,
            },
            create: {
              symbol: item.symbol,
              date: todayDate,
              open: quote.open ?? quote.price,
              high: quote.dayHigh ?? quote.price,
              low: quote.dayLow ?? quote.price,
              close: quote.price,
              volume: quote.volume ?? 0,
            }
          });

          const changePct = pctChange(quote.price, quote.prevClose);
          if (changePct != null) {
            if (changePct > 0) advancesList.push(item.symbol);
            else if (changePct < 0) declinesList.push(item.symbol);
          }

          scanResults.push({
            symbol: item.symbol,
            price: quote.price,
            prevClose: quote.prevClose,
            changePct,
          });

          successCount++;
        } else {
          console.warn(`[scanner] Failed to get live quote for ${item.symbol}`);
          failedCount++;
        }
      } catch (err) {
        console.error(`[scanner] Error scanning ${item.symbol} in Phase 1:`, err);
        failedCount++;
      }
    })
  );

  console.log("[scanner] Phase 2: Evaluating market risk radar & sector strengths...");
  const niftySymbol = "^NSEI"; 
  const sensexSymbol = "^BSESN";
  const bankNiftySymbol = "^NSEBANK";
  const vixSymbol = "^INDIAVIX";
  
  const riskQuotes = await marketDataProvider.getQuotes([niftySymbol, sensexSymbol, bankNiftySymbol, vixSymbol, "^GSPC", "^IXIC", "^DJI"]);
  
  const marketRiskResult = computeMarketRisk({
    niftyChange: pctChange(riskQuotes[niftySymbol]?.price, riskQuotes[niftySymbol]?.prevClose),
    sensexChange: pctChange(riskQuotes[sensexSymbol]?.price, riskQuotes[sensexSymbol]?.prevClose),
    bankNiftyChange: pctChange(riskQuotes[bankNiftySymbol]?.price, riskQuotes[bankNiftySymbol]?.prevClose),
    indiaVix: riskQuotes[vixSymbol]?.price ?? null,
    spxChange: pctChange(riskQuotes["^GSPC"]?.price, riskQuotes["^GSPC"]?.prevClose),
    nasdaqChange: pctChange(riskQuotes["^IXIC"]?.price, riskQuotes["^IXIC"]?.prevClose),
    dowChange: pctChange(riskQuotes["^DJI"]?.price, riskQuotes["^DJI"]?.prevClose),
    advances: advancesList.length,
    declines: declinesList.length,
  });

  await prisma.marketRisk.create({
    data: {
      score: marketRiskResult.score,
      level: marketRiskResult.classification.split(" ")[0] || "MODERATE",
      details: JSON.stringify({
        factors: marketRiskResult.factors,
        reasons: marketRiskResult.reasons,
        statusEmoji: marketRiskResult.statusEmoji,
      })
    }
  });

  const uniqueSectors = Array.from(new Set(UNIVERSE.map((u) => u.sectorKey).filter(Boolean)));
  for (const sectorKey of uniqueSectors) {
    try {
      const change = await getSectorChangeForKey(sectorKey).catch(() => null);
      if (change != null) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        await prisma.sectorAnalysis.upsert({
          where: { sector_date: { sector: sectorKey, date: today } },
          update: {
            returnPct: change,
            strength: change > 0.015 ? "STRONG" : change < -0.015 ? "WEAK" : "MODERATE"
          },
          create: {
            sector: sectorKey,
            date: today,
            returnPct: change,
            strength: change > 0.015 ? "STRONG" : change < -0.015 ? "WEAK" : "MODERATE"
          }
        });
      }
    } catch {}
  }

  console.log("[scanner] Phase 3: Generating individual buy/sell indicators and recommendation cards...");

  // Same bounded-concurrency approach as the quote fetch above — process a
  // batch of symbols' fundamentals/news/indicators/DB writes at once instead
  // of one at a time, which is what made this phase take the bulk of a
  // multi-minute scan.
  const PHASE3_BATCH_SIZE = 12;
  for (let i = 0; i < scanResults.length; i += PHASE3_BATCH_SIZE) {
    const batch = scanResults.slice(i, i + PHASE3_BATCH_SIZE);
    await Promise.all(
      batch.map(async (stock) => {
        try {
          const uItem = lookupUniverse(stock.symbol);
          if (!uItem) return;

      const [prices, fundamentals, newsRaw] = await Promise.all([
        prisma.stockPrice.findMany({
          where: { symbol: stock.symbol },
          orderBy: { date: "asc" },
        }),
        marketDataProvider.getFundamentals(stock.symbol).catch(() => null),
        newsProvider.getNews(`${uItem.display} stock`, 5).catch(() => []),
      ]);

      if (prices.length < 30) {
        console.warn(`[scanner] Skipping indicators for ${stock.symbol} due to insufficient price candles (${prices.length} found)`);
        return;
      }

      const candles = prices.map((p) => ({
        time: Math.floor(p.date.getTime() / 1000),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const indicators = computeIndicators(candles);
      const sentimentScore = newsRaw.length > 0 ? 0.1 : 0.0;
      const sectorChange = await getSectorChangeForKey(uItem.sectorKey).catch(() => null);

      const rec = RecommendationEngine.generate({
        symbol: stock.symbol,
        price: stock.price,
        prevClose: stock.prevClose,
        indicators,
        fundamentals,
        sectorChangePct: sectorChange,
        marketRiskScore: marketRiskResult.score,
        candlesCount: prices.length,
        newsSentimentScore: sentimentScore,
      });

      const lastRec = await prisma.stockRecommendation.findUnique({ where: { symbol: stock.symbol } });

      await prisma.stockRecommendation.upsert({
        where: { symbol: stock.symbol },
        update: {
          action: rec.action,
          score: rec.score,
          confidence: rec.confidence,
          risk: rec.risk,
          reasons: JSON.stringify(rec.reasons),
          warnings: JSON.stringify(rec.warnings),
          entryZoneMin: rec.entryZone?.min ?? null,
          entryZoneMax: rec.entryZone?.max ?? null,
          stopLoss: rec.stopLoss ?? null,
          targetRangeMin: rec.targetRange?.min ?? null,
          targetRangeMax: rec.targetRange?.max ?? null,
          dataQuality: rec.dataQuality,
          generatedAt: rec.generatedAt,
        },
        create: {
          symbol: stock.symbol,
          action: rec.action,
          score: rec.score,
          confidence: rec.confidence,
          risk: rec.risk,
          reasons: JSON.stringify(rec.reasons),
          warnings: JSON.stringify(rec.warnings),
          entryZoneMin: rec.entryZone?.min ?? null,
          entryZoneMax: rec.entryZone?.max ?? null,
          stopLoss: rec.stopLoss ?? null,
          targetRangeMin: rec.targetRange?.min ?? null,
          targetRangeMax: rec.targetRange?.max ?? null,
          dataQuality: rec.dataQuality,
          generatedAt: rec.generatedAt,
        }
      });

      await prisma.recommendationHistory.create({
        data: {
          symbol: stock.symbol,
          action: rec.action,
          score: rec.score,
          confidence: rec.confidence,
          risk: rec.risk,
          reasons: JSON.stringify(rec.reasons),
          generatedAt: rec.generatedAt,
        }
      });

      // Only notify on a real change from a real prior reading — a brand new
      // symbol (no lastRec yet) has no genuine "before" state, so treating its
      // first-ever score as a change from a fabricated HOLD baseline would
      // fire false alerts for every newly-added symbol. And only the users
      // who actually hold or watch this symbol are notified — not the whole
      // user base — so this stays a signal about something they own or
      // track, not market-wide noise.
      if (lastRec && lastRec.action !== rec.action) {
        const oldBucket = directionBucket(lastRec.action);
        const newBucket = directionBucket(rec.action);
        // WAIT is a temporary safety override, not a directional call — skip
        // transitions into/out of it so this doesn't fire on risk-off noise.
        if (oldBucket !== newBucket && oldBucket !== "WAIT" && newBucket !== "WAIT") {
          // Holdings/watchlist entries are inconsistently stored with or
          // without the provider's exchange suffix (e.g. "RELIANCE" vs
          // "RELIANCE.NS") — match either form rather than assuming one.
          const bareSymbol = stock.symbol.replace(/\.(NS|BO)$/, "");
          const [holders, watchers] = await Promise.all([
            prisma.holding.findMany({ where: { stock: { in: [stock.symbol, bareSymbol] } }, select: { userId: true } }),
            prisma.watchlistItem.findMany({ where: { symbol: { in: [stock.symbol, bareSymbol] } }, select: { userId: true } }),
          ]);
          const interestedUserIds = new Set([...holders.map((h) => h.userId), ...watchers.map((w) => w.userId)]);

          if (interestedUserIds.size > 0) {
            const title = `Signal change: ${uItem.display}`;
            const body = `${uItem.display} moved from ${lastRec.action} to ${rec.action} (score ${rec.score}/100).`;
            await prisma.notification.createMany({
              data: [...interestedUserIds].map((userId) => ({
                userId,
                category: "STOCK",
                priority: rec.action.includes("STRONG") ? "HIGH" : "NORMAL",
                title,
                body,
                link: `/stock/${encodeURIComponent(stock.symbol)}`,
              })),
            });
          }
        }
      }

        } catch (err) {
          console.error(`[scanner] Failed to generate signals for ${stock.symbol}:`, err);
        }
      })
    );
  }

  await prisma.dataSyncLog.create({
    data: {
      type: "UPDATE",
      status: failedCount > 0 ? "SUCCESS_WITH_ERRORS" : "SUCCESS",
      symbolsCount: successCount,
      details: `Scan complete: ${successCount} updated successfully, ${failedCount} failed.`
    }
  });

  const syncEnd = new Date();
  console.log(`[scanner] Market scan completed in ${((syncEnd.getTime() - syncStart.getTime()) / 1000).toFixed(1)}s`);
}

export function startScannerBackgroundJob() {
  // First boot and every restart both just run the real scan — it already
  // backfills real history for any symbol with thin data (see backfillStock),
  // so there's no need for a synthetic seed path. A fabricated first-boot
  // seed previously written ~90 days of Math.random() candles for 8 marquee
  // symbols (TCS, INFY, RELIANCE, HDFCBANK, SBIN, AAPL, TSLA, NVDA) directly
  // into StockPrice; because backfill only triggers under 30 existing rows,
  // that fake history never got replaced and permanently skewed their
  // SMA/RSI/trend indicators. Real data takes longer to appear on a cold
  // database, but it's never wrong.
  runMarketScan().catch((err) => {
    console.error("[scanner] Initial scanner run failed:", err);
  });

  const timer = setInterval(async () => {
    try {
      await runMarketScan();
    } catch (err) {
      console.error("[scanner] Background market scan execution failed:", err);
    }
  }, 4 * 3600 * 1000);
  
  timer.unref?.();
  console.log("[scanner] Background market scanning job registered (every 4 hours)");
}

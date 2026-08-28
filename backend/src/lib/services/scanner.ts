import { prisma } from "../prisma";
import { marketDataProvider, newsProvider } from "../providers";
import { UNIVERSE, lookupUniverse } from "../universe";
import { computeIndicators, pctChange } from "../indicators";
import { computeMarketRisk } from "../engine/marketRisk";
import { RecommendationEngine, type SignalAction } from "./recommendationEngine";
import { getSectorChangeForKey } from "./market";

function generateModeledPrices(symbol: string, basePrice: number, dailyVol: number, trend: number, count = 90) {
  const candles = [];
  let price = basePrice;
  const start = new Date(Date.now() - count * 24 * 3600 * 1000);
  
  for (let i = 0; i < count; i++) {
    const date = new Date(start.getTime() + i * 24 * 3600 * 1000);
    date.setUTCHours(0, 0, 0, 0);
    
    const ret = trend + (Math.random() - 0.5) * dailyVol;
    const open = price;
    const close = price * (1 + ret);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = Math.round(150000 + Math.random() * 600000);
    
    candles.push({
      symbol,
      date,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
    
    price = close;
  }
  return candles;
}

export async function seedInitialSignalsData(): Promise<void> {
  try {
    console.log("[scanner] Seeding database with modeled historical candles and recommendations...");
    
    // Seed default Market Risk Snapshot
    await prisma.marketRisk.create({
      data: {
        score: 62,
        level: "MODERATE",
        details: JSON.stringify({
          factors: [
            { key: "indexTrend", label: "Index Trend", score: 55, weight: 0.20, available: true, detail: "Index holding short term support levels" },
            { key: "volatility", label: "Market Volatility", score: 48, weight: 0.20, available: true, detail: "India VIX at 14.2" },
            { key: "globalMarkets", label: "Global Markets", score: 65, weight: 0.15, available: true, detail: "Nasdaq index consolidation" },
            { key: "largeCapDivergence", label: "Sector Divergence", score: 40, weight: 0.10, available: true, detail: "Normal banking divergence" },
            { key: "breadth", label: "Market Breadth", score: 70, weight: 0.15, available: true, detail: "105 Advances / 78 Declines" }
          ],
          reasons: ["Indices are consolidating with moderate volatility and stable market breadth."],
          statusEmoji: "🟡"
        })
      }
    });

    const seeds = [
      { symbol: "TCS.NS", basePrice: 3420, vol: 0.015, trend: 0.0008 },
      { symbol: "INFY.NS", basePrice: 1450, vol: 0.018, trend: -0.0015 },
      { symbol: "RELIANCE.NS", basePrice: 2450, vol: 0.012, trend: 0.0001 },
      { symbol: "HDFCBANK.NS", basePrice: 1580, vol: 0.014, trend: 0.0004 },
      { symbol: "SBIN.NS", basePrice: 650, vol: 0.016, trend: 0.0003 },
      { symbol: "AAPL", basePrice: 182, vol: 0.014, trend: 0.0006 },
      { symbol: "TSLA", basePrice: 210, vol: 0.032, trend: -0.002 },
      { symbol: "NVDA", basePrice: 850, vol: 0.028, trend: 0.0028 }
    ];

    for (const seed of seeds) {
      const prices = generateModeledPrices(seed.symbol, seed.basePrice, seed.vol, seed.trend);
      
      // Save candles
      await prisma.stockPrice.createMany({
        data: prices,
        skipDuplicates: true
      });

      const candles = prices.map((p) => ({
        time: Math.floor(p.date.getTime() / 1000),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      }));

      const indicators = computeIndicators(candles);
      const lastPrice = prices[prices.length - 1];

      // Save Indicators
      const todayDate = new Date();
      todayDate.setUTCHours(0, 0, 0, 0);
      await prisma.stockIndicator.upsert({
        where: { symbol_date: { symbol: seed.symbol, date: todayDate } },
        update: { indicators: JSON.stringify(indicators) },
        create: { symbol: seed.symbol, date: todayDate, indicators: JSON.stringify(indicators) },
      });

      // Generate recommendation
      const rec = RecommendationEngine.generate({
        symbol: seed.symbol,
        price: lastPrice.close,
        prevClose: prices[prices.length - 2]?.close ?? null,
        indicators,
        fundamentals: {
          symbol: seed.symbol,
          name: seed.symbol,
          sector: "Technology",
          industry: "Software",
          marketCap: 100000000,
          peRatio: seed.symbol.includes("NVDA") ? 75 : seed.symbol.includes("TCS") ? 28 : 14,
          pbRatio: 3.5,
          roe: 22,
          debtToEquity: 0.2,
          revenueGrowth: 15,
          freeCashFlow: 10000000,
          dividendYield: 1.2,
          beta: 1.1,
          eps: 12.5,
        } as any,
        sectorChangePct: 0.005,
        marketRiskScore: 62,
        candlesCount: prices.length,
        newsSentimentScore: 0.2,
      });

      // Save recommendation
      await prisma.stockRecommendation.upsert({
        where: { symbol: seed.symbol },
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
          symbol: seed.symbol,
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

      // Save history
      await prisma.recommendationHistory.create({
        data: {
          symbol: seed.symbol,
          action: rec.action,
          score: rec.score,
          confidence: rec.confidence,
          risk: rec.risk,
          reasons: JSON.stringify(rec.reasons),
          generatedAt: rec.generatedAt,
        }
      });
    }

    console.log("[scanner] Seeding completed successfully!");
  } catch (err) {
    console.error("[scanner] Seeding failed:", err);
  }
}

export async function backfillStock(symbol: string): Promise<boolean> {
  try {
    console.log(`[scanner] Starting backfill for ${symbol}...`);
    const candles = await marketDataProvider.getCandles(symbol, "1Y");
    
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

  for (const item of UNIVERSE) {
    try {
      const existingCount = await prisma.stockPrice.count({ where: { symbol: item.symbol } });
      
      if (existingCount < 30) {
        const ok = await backfillStock(item.symbol);
        if (!ok) {
          failedCount++;
          continue;
        }
      }

      const quote = await marketDataProvider.getQuote(item.symbol);
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
  }

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
  const users = await prisma.user.findMany({ select: { id: true } });

  for (const stock of scanResults) {
    try {
      const uItem = lookupUniverse(stock.symbol);
      if (!uItem) continue;

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
        continue;
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
      const yesterdayAction = lastRec ? lastRec.action : "HOLD";

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

      if (yesterdayAction !== rec.action && users.length > 0) {
        const isSignificant =
          (yesterdayAction === "HOLD" && rec.action.includes("BUY")) ||
          (yesterdayAction.includes("BUY") && rec.action === "HOLD") ||
          (yesterdayAction.includes("BUY") && rec.action.includes("SELL")) ||
          (yesterdayAction === "HOLD" && rec.action.includes("SELL"));

        if (isSignificant) {
          const title = `🔔 SIGNAL CHANGE: ${uItem.display}`;
          const body = `${uItem.display} changed from ${yesterdayAction} to ${rec.action} (Score: ${rec.score}/100)`;
          
          const notifs = users.map((u) => ({
            userId: u.id,
            category: "RECOMMENDATION",
            title,
            body,
            link: `/stock/${encodeURIComponent(uItem.display)}`,
            priority: rec.action.includes("STRONG") ? "HIGH" : "NORMAL",
          }));

          await prisma.notification.createMany({ data: notifs });
        }
      }

    } catch (err) {
      console.error(`[scanner] Failed to generate signals for ${stock.symbol}:`, err);
    }
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
  // Check if we need to seed initial indicators/recommendations for first-time use
  prisma.stockRecommendation.count().then((count) => {
    if (count === 0) {
      seedInitialSignalsData().catch((err) => {
        console.error("[scanner] Seeding on boot failed:", err);
      });
    } else {
      // Run normal scan if already seeded
      runMarketScan().catch((err) => {
        console.error("[scanner] Initial scanner run failed:", err);
      });
    }
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

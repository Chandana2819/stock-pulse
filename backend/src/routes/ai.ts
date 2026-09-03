import express from "express";
import { prisma } from "../lib/prisma";
import { classifyIntent, explainConcept, isLlmConfigured, smoothWithLlm } from "../lib/engine/assistant";
import { buildStockAnalysis, getRecentSignalTrend } from "../lib/services/stockAnalysis";
import { diagnosePortfolio, type HoldingLite } from "../lib/engine/portfolioDoctor";
import { getEnrichedHoldings, ensureProfile } from "../lib/services/portfolio";
import { lookupUniverse } from "../lib/universe";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v, sanitizeText } from "../lib/validate";
import { aiLimiter } from "../middleware/rateLimit";

const router = express.Router();
router.use(aiLimiter);

const USD_INR_FALLBACK = 87;

async function saveInsight(userId: string | null, scope: string, subject: string | null, question: string | null, result: { conclusion: string; why: string; evidence: unknown; confidence: number; risk?: string; wouldChange?: string }) {
  try {
    await prisma.aIInsight.create({
      data: {
        userId,
        scope,
        subject,
        question,
        conclusion: result.conclusion,
        why: result.why,
        evidence: JSON.stringify(result.evidence),
        confidence: result.confidence,
        risk: result.risk,
        wouldChange: result.wouldChange,
      },
    });
  } catch (e) {
    console.error("[ai] failed to persist insight", e);
  }
}

router.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const { symbol } = parse({ symbol: v.string({ min: 1, max: 24 }) }, req.body);
    const analysis = await buildStockAnalysis(symbol);
    if (!analysis.found) throw ApiError.notFound("Stock not found");

    const result = {
      conclusion: analysis.decision.decision,
      why: analysis.decision.reasons.join(" "),
      evidence: analysis.decision.pillars,
      confidence: analysis.decision.confidence,
      risk: analysis.decision.mainRisk,
      wouldChange: analysis.decision.wouldChange.join("; "),
    };
    await saveInsight(req.user?.id ?? null, "STOCK", analysis.symbol, null, result);
    return res.json({ symbol: analysis.symbol, decision: analysis.decision, attribution: analysis.attribution });
  })
);

router.post(
  "/explain",
  asyncHandler(async (req, res) => {
    const { symbol } = parse({ symbol: v.string({ min: 1, max: 24 }) }, req.body);
    const analysis = await buildStockAnalysis(symbol);
    if (!analysis.found) throw ApiError.notFound("Stock not found");
    if (!analysis.attribution) throw ApiError.badRequest("Not enough data to explain today's move");
    return res.json({ symbol: analysis.symbol, priceChangePct: analysis.priceChangePct, attribution: analysis.attribution });
  })
);

// A follow-up question ("what about the risk", "and the stop-loss?") won't
// name a symbol again — if intent classification comes up empty but the
// caller told us which symbol the conversation was already about, and the
// question reads like it's still about a stock, carry that symbol forward
// instead of falling back to the generic menu.
function looksLikeStockFollowUp(q: string): boolean {
  return /(risk|target|stop.?loss|entry|chart|trend|timeline|outlook|score|confidence|why|it|this|that|hold|buy|sell)/i.test(q);
}

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { question, contextSymbol } = parse(
      { question: v.string({ min: 1, max: 500 }), contextSymbol: v.optional(v.string({ max: 24 })) },
      req.body
    );
    const cleanQuestion = sanitizeText(question, 500);
    let intent = classifyIntent(cleanQuestion);

    if (intent.type === "UNKNOWN" && contextSymbol && looksLikeStockFollowUp(cleanQuestion.toLowerCase())) {
      intent = { type: "STOCK_DECISION", symbol: contextSymbol };
    }

    let answer = "";
    let confidence = 60;
    let evidence: unknown = {};
    let subject: string | null = null;

    switch (intent.type) {
      case "CONCEPT_EXPLAIN": {
        answer = explainConcept(intent.term);
        confidence = 90;
        subject = intent.term;
        break;
      }
      case "EXPLAIN_STOCK_MOVE": {
        const analysis = await buildStockAnalysis(intent.symbol);
        if (!analysis.found || !analysis.attribution) {
          answer = `I couldn't find enough data to explain ${intent.symbol}'s move right now.`;
          confidence = 30;
        } else {
          const pct = analysis.priceChangePct;
          const sym = analysis.resolved.displaySymbol;
          const trend = await getRecentSignalTrend(analysis.symbol, analysis.decision.score);
          const parts = [
            `${sym} is ${pct != null && pct >= 0 ? "up" : "down"} ${pct != null ? Math.abs(pct).toFixed(2) : "0"}% today.`,
            analysis.attribution.mainReasons.join(" "),
            `Current AI call: ${analysis.decision.decision} (${analysis.decision.score}/100).`,
          ];
          if (trend) {
            parts.push(`Over its last ${trend.sampleSize} scans it has ${trend.flipSummary}.`);
          }
          parts.push(analysis.attribution.disclaimer);
          parts.push(`Full chart: /stock/${encodeURIComponent(sym)}`);
          answer = parts.join(" ");
          confidence = analysis.attribution.confidence === "HIGH" ? 80 : analysis.attribution.confidence === "MEDIUM" ? 60 : 40;
          evidence = { breakdown: analysis.attribution.breakdown, trend };
        }
        subject = intent.symbol;
        break;
      }
      case "STOCK_DECISION": {
        const analysis = await buildStockAnalysis(intent.symbol);
        if (!analysis.found) {
          answer = `I couldn't find ${intent.symbol}.`;
          confidence = 30;
        } else {
          const d = analysis.decision;
          const sym = analysis.resolved.displaySymbol;
          const currency = analysis.resolved.exchange === "GLOBAL" ? "$" : "₹";
          const trend = await getRecentSignalTrend(analysis.symbol, d.score);

          const parts: string[] = [];
          parts.push(`${sym}: ${d.decision} — score ${d.score}/100, ${d.confidence}% confidence.`);
          if (d.reasons?.length) parts.push(d.reasons.slice(0, 2).join(" "));

          if (d.decision?.includes("BUY") && d.entryZone && d.stopLoss && d.targetRange) {
            parts.push(
              `Suggested entry ${currency}${d.entryZone.min}–${currency}${d.entryZone.max}, stop-loss ${currency}${d.stopLoss}, target ${currency}${d.targetRange.min}–${currency}${d.targetRange.max}.`
            );
          }

          if (d.horizon) {
            parts.push(`${d.horizon.label}: ${d.horizon.reasoning}`);
          }
          if (d.activeSince) {
            parts.push(
              d.activeSince.activeDays === 0
                ? "This call was just formed in the most recent scan."
                : `This call has held for ${d.activeSince.activeDays} day${d.activeSince.activeDays === 1 ? "" : "s"} so far.`
            );
          }
          if (trend) {
            parts.push(
              `Over the last ${trend.sampleSize} scans it has ${trend.flipSummary}${
                trend.scoreDelta != null ? `, score ${trend.scoreDelta >= 0 ? "up" : "down"} ${Math.abs(trend.scoreDelta)} pts from a week ago` : ""
              }.`
            );
          }

          parts.push(`Main risk: ${d.mainRisk}`);
          parts.push(`Full chart & 7-pillar breakdown: /stock/${encodeURIComponent(sym)}`);

          answer = parts.join(" ");
          confidence = d.confidence;
          evidence = { pillars: d.pillars, horizon: d.horizon, activeSince: d.activeSince, trend };
        }
        subject = intent.symbol;
        break;
      }
      case "COMPARE_STOCKS": {
        const analyses = await Promise.all(intent.symbols.map((s) => buildStockAnalysis(s)));
        const lines = analyses.map((a, i) =>
          a.found
            ? `${a.resolved.displaySymbol}: ${a.decision.decision} (score ${a.decision.score}/100, PE ${a.fundamentals?.peRatio?.toFixed(1) ?? "n/a"}, ROE ${a.fundamentals?.roe?.toFixed(1) ?? "n/a"}%, ${a.decision.confidence}% confidence${a.decision.horizon ? `, ${a.decision.horizon.label.toLowerCase()}` : ""})`
            : `${intent.symbols[i]}: not found`
        );
        const found = analyses.filter((a) => a.found);
        const best = [...found].sort((a, b) => (b.decision.score ?? 0) - (a.decision.score ?? 0))[0];
        answer = lines.join(" · ") + (best ? ` Highest composite score: ${best.resolved.displaySymbol} at ${best.decision.score}/100.` : "");
        confidence = 65;
        evidence = found.map((a) => ({ symbol: a.symbol, decision: a.decision }));
        subject = intent.symbols.join(",");
        break;
      }
      case "PORTFOLIO_RISK":
      case "PORTFOLIO_EXPOSURE": {
        if (!req.user) {
          answer = "Sign in to see your portfolio exposure.";
          confidence = 20;
          break;
        }
        const [holdings, profile] = await Promise.all([getEnrichedHoldings(req.user.id), ensureProfile(req.user.id)]);
        const lite: HoldingLite[] = holdings.map((h) => {
          const entry = lookupUniverse(h.stock);
          return { stock: h.stock, displaySym: h.displaySym, currency: h.currency as "INR" | "USD", value: h.value ?? 0, sectorKey: entry?.sectorKey ?? null, sector: entry?.sector ?? null };
        });
        const health = diagnosePortfolio({ holdings: lite, cashInr: 0, cashUsd: 0, usdToInr: USD_INR_FALLBACK, riskTolerance: profile.riskTolerance as "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE" });
        if (intent.type === "PORTFOLIO_EXPOSURE" && intent.sectorHint) {
          const match = health.sectorExposure.find((s) => s.sector.toLowerCase().includes(intent.sectorHint!) || s.sectorKey.toLowerCase() === intent.sectorHint);
          answer = match ? `You are ${match.pctOfPortfolio.toFixed(1)}% exposed to ${match.sector}.` : `I don't see meaningful exposure to "${intent.sectorHint}" in your current holdings.`;
        } else {
          const top = health.sectorExposure[0];
          answer = `Portfolio health score: ${health.score}/100. ${health.problems[0] ?? "No major issues detected."} ${top ? `Largest sector exposure: ${top.sector} at ${top.pctOfPortfolio.toFixed(1)}%.` : ""}`;
        }
        confidence = 70;
        evidence = health;
        break;
      }
      case "PORTFOLIO_MOVE_TODAY": {
        if (!req.user) {
          answer = "Sign in to see how your portfolio moved today.";
          confidence = 20;
          break;
        }
        const holdings = await getEnrichedHoldings(req.user.id);
        const totalPl = holdings.reduce((s, h) => s + (h.pl ?? 0), 0);
        const biggest = [...holdings].sort((a, b) => Math.abs(b.pl ?? 0) - Math.abs(a.pl ?? 0))[0];
        answer = holdings.length === 0
          ? "You don't have any holdings yet, so there's nothing to move."
          : `Your portfolio's unrealized P&L is currently ${totalPl >= 0 ? "+" : ""}${totalPl.toFixed(2)}. ${biggest ? `${biggest.displaySym} is the biggest single contributor at ${biggest.pl != null && biggest.pl >= 0 ? "+" : ""}${(biggest.pl ?? 0).toFixed(2)}.` : ""} For a day-by-day cause, check the "why is this stock moving" panel on each holding.`;
        confidence = 65;
        break;
      }
      case "BUILD_PORTFOLIO": {
        const picks = ["TCS.NS", "HDFCBANK.NS", "RELIANCE.NS", "HINDUNILVR.NS", "SUNPHARMA.NS"];
        const perStock = intent.amount / picks.length;
        answer = `A simple diversified starting basket across sectors for ₹${intent.amount.toLocaleString("en-IN")}: ${picks.map((p) => `${p.replace(".NS", "")} (~₹${Math.round(perStock)})`).join(", ")}. This spreads across IT, banking, energy, FMCG and pharma — review each stock's own decision panel before investing, this is a diversification starting point, not a recommendation to buy today.`;
        confidence = 55;
        evidence = { picks, perStock };
        break;
      }
      default:
        answer = "I can help with: why a stock is moving, whether to buy/hold a stock, comparing stocks, your portfolio's sector exposure and risk, building a diversified basket, or explaining an investing term (e.g. 'what is PE ratio'). Try asking one of those.";
        confidence = 40;
    }

    if (isLlmConfigured() && confidence >= 40) {
      answer = await smoothWithLlm(answer, cleanQuestion);
    }

    await saveInsight(req.user?.id ?? null, "CHAT", subject, cleanQuestion, { conclusion: answer, why: intent.type, evidence, confidence });

    const symbol =
      intent.type === "STOCK_DECISION" || intent.type === "EXPLAIN_STOCK_MOVE" ? intent.symbol : null;

    return res.json({ answer, intent: intent.type, confidence, evidence, symbol });
  })
);

router.get(
  "/insights",
  asyncHandler(async (req, res) => {
    const insights = await prisma.aIInsight.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return res.json(insights.map((i) => ({ ...i, evidence: safeParse(i.evidence) })));
  })
);

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export default router;

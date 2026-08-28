import express from "express";
import { prisma } from "../lib/prisma";
import { classifyIntent, explainConcept, isLlmConfigured, smoothWithLlm } from "../lib/engine/assistant";
import { buildStockAnalysis } from "../lib/services/stockAnalysis";
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

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { question } = parse({ question: v.string({ min: 1, max: 500 }) }, req.body);
    const cleanQuestion = sanitizeText(question, 500);
    const intent = classifyIntent(cleanQuestion);

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
          answer = `${analysis.resolved.displaySymbol} is ${pct != null && pct >= 0 ? "up" : "down"} ${pct != null ? Math.abs(pct).toFixed(2) : "0"}% today. ${analysis.attribution.mainReasons.join(" ")} ${analysis.attribution.disclaimer}`;
          confidence = analysis.attribution.confidence === "HIGH" ? 80 : analysis.attribution.confidence === "MEDIUM" ? 60 : 40;
          evidence = analysis.attribution.breakdown;
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
          answer = `${d.decision} (confidence ${d.confidence}%). ${d.reasons.join(" ")} Main risk: ${d.mainRisk}. This would change with: ${d.wouldChange.join(", ")}.`;
          confidence = d.confidence;
          evidence = d.pillars;
        }
        subject = intent.symbol;
        break;
      }
      case "COMPARE_STOCKS": {
        const analyses = await Promise.all(intent.symbols.map((s) => buildStockAnalysis(s)));
        const lines = analyses.map((a, i) =>
          a.found ? `${a.resolved.displaySymbol}: ${a.decision.decision} (PE ${a.fundamentals?.peRatio?.toFixed(1) ?? "n/a"}, ROE ${a.fundamentals?.roe?.toFixed(1) ?? "n/a"}%, ${a.decision.confidence}% confidence)` : `${intent.symbols[i]}: not found`
        );
        answer = lines.join(" · ");
        confidence = 65;
        evidence = analyses.filter((a) => a.found).map((a) => (a.found ? { symbol: a.symbol, decision: a.decision } : null));
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

    return res.json({ answer, intent: intent.type, confidence, evidence });
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

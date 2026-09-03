// AI Investment Assistant — intent router over the app's own data.
//
// This is deliberately NOT a free-form chatbot wrapper: every question is
// matched to an intent (explain a move, compare stocks, portfolio exposure,
// concept lookup, etc.) and answered from data already computed elsewhere in
// this codebase (decision engine, portfolio doctor, market risk, fundamentals).
// If an OPENAI_API_KEY/ANTHROPIC_API_KEY is configured, the final prose can be
// smoothed by an LLM call — but the facts and numbers always come from our own
// engines, never from the model's own "knowledge" of a stock.

import { env } from "../../config/env";
import { lookupUniverse, searchUniverse } from "../universe";

export type AssistantContext = {
  question: string;
  portfolioSummary?: string;
  watchlist?: string[];
  riskProfile?: { tolerance: string; horizonYears: number };
  marketRisk?: { score: number; classification: string } | null;
};

export type AssistantIntent =
  | { type: "EXPLAIN_STOCK_MOVE"; symbol: string }
  | { type: "STOCK_DECISION"; symbol: string }
  | { type: "COMPARE_STOCKS"; symbols: string[] }
  | { type: "PORTFOLIO_RISK" }
  | { type: "PORTFOLIO_EXPOSURE"; sectorHint?: string }
  | { type: "PORTFOLIO_MOVE_TODAY" }
  | { type: "BUILD_PORTFOLIO"; amount: number }
  | { type: "CONCEPT_EXPLAIN"; term: string }
  | { type: "UNKNOWN" };

const CONCEPTS: Record<string, string> = {
  "pe ratio": "PE (Price-to-Earnings) ratio = Share Price ÷ Earnings Per Share. It shows how many years of current profit you're paying for. A high PE can mean the market expects strong growth — or that the stock is expensive relative to its earnings. Compare it to the company's own history and its sector average, not to an absolute number.",
  "p/e ratio": "PE (Price-to-Earnings) ratio = Share Price ÷ Earnings Per Share. It shows how many years of current profit you're paying for. A high PE can mean the market expects strong growth — or that the stock is expensive relative to its earnings. Compare it to the company's own history and its sector average, not to an absolute number.",
  "roe": "ROE (Return on Equity) = Net Profit ÷ Shareholder Equity. It measures how efficiently a company turns shareholders' money into profit. Above ~15% is generally considered strong for Indian large-caps, but capital-heavy sectors (banks, capital goods) run differently from asset-light ones (IT, FMCG).",
  "roce": "ROCE (Return on Capital Employed) = EBIT ÷ Capital Employed. Unlike ROE, it includes debt as well as equity, so it is a better efficiency measure for companies that borrow heavily to grow.",
  "market cap": "Market Capitalisation = Share Price × Total Shares Outstanding. It is the market's current price tag for the whole company, used to bucket stocks into large-cap, mid-cap and small-cap.",
  "rsi": "RSI (Relative Strength Index) measures how fast and how far a price has moved recently, on a 0-100 scale. Above 70 is often called 'overbought', below 30 'oversold' — but in a strong trend RSI can stay extreme for a long time, so it works best combined with trend and volume, not alone.",
  "macd": "MACD (Moving Average Convergence Divergence) compares a fast and slow moving average of price. When the MACD line crosses above its signal line it is often read as bullish momentum building; below, as momentum fading.",
  "xirr": "XIRR (Extended Internal Rate of Return) is the annualised return of a series of cash flows made on different dates — exactly what a SIP or a portfolio with multiple buys/sells needs, unlike a simple CAGR which assumes one lump-sum investment.",
  "cagr": "CAGR (Compound Annual Growth Rate) is the smoothed annual growth rate that would take an investment from its starting value to its ending value over a period, assuming steady compounding.",
  "sip": "A SIP (Systematic Investment Plan) is a fixed amount invested at regular intervals (usually monthly), which averages your purchase price over time (rupee-cost averaging) instead of timing the market with a lump sum.",
  "dividend yield": "Dividend Yield = Annual Dividend per Share ÷ Share Price, expressed as a percentage. It shows the cash return you get from dividends alone, separate from any price appreciation.",
  "debt to equity": "Debt-to-Equity = Total Debt ÷ Shareholder Equity. Lower generally means the company relies less on borrowed money, which usually means lower financial risk — but some capital-intensive businesses (utilities, banks) normally run higher ratios.",
  "beta": "Beta measures how much a stock tends to move relative to the overall market. A beta of 1.5 means the stock has historically moved about 1.5x as much as the index, in the same direction.",
  "volatility": "Volatility measures how much a price swings over time, usually shown as an annualised percentage. Higher volatility means bigger potential swings in both directions — more risk, and more potential reward.",
};

// Pulls every stock this question is plausibly talking about, in priority
// order: exact ticker/display matches first, then fuzzy company-name matches
// on 2-word windows (catches "Tata Motors", "HDFC Bank") then single words.
// Fuzzy matching is done PER CANDIDATE WORD, never on the raw sentence —
// searchUniverse expects a name-shaped query, and no company's name equals
// a whole question, so passing the full text there always missed real
// company names like "Infosys".
// Common short filler words. searchUniverse matches by substring, so a bare
// 2-3 letter word like "on"/"one"/"that" can accidentally hit inside a real
// company name (e.g. "on" inside "MOTHERSON") — excluding them, and requiring
// standalone single-word candidates to be at least 4 letters, keeps fuzzy
// matching to words that could plausibly BE a company name.
const STOP_WORDS = new Set([
  "SHOULD", "WOULD", "COULD", "WHAT", "WHY", "HOW", "MORE", "ADD", "BUY", "SELL", "HOLD", "COMPARE", "VERSUS",
  "ON", "AT", "IN", "TO", "IS", "IT", "OR", "AS", "BE", "OF", "MY", "NO", "DO", "IF", "SO", "UP", "GO", "ME", "WE", "AN",
  "THAT", "THIS", "WITH", "FROM", "ABOUT", "YOUR", "HAVE", "HAS", "HAD", "ARE", "WAS", "FOR", "AND", "NOT", "CAN",
  "ALL", "ONE", "OUT", "GET", "JUST", "LIKE", "THINK", "KNOW", "WANT", "NEED", "THE", "THEM", "THEY", "WHEN", "WILL",
]);

function extractSymbols(text: string, max = 3): string[] {
  const words = text.toUpperCase().match(/[A-Z][A-Z0-9&.\-]{1,15}/g) ?? [];
  const found: string[] = [];

  for (const w of words) {
    const hit = lookupUniverse(w);
    if (hit && !found.includes(hit.display)) found.push(hit.display);
  }
  if (found.length >= max) return found.slice(0, max);

  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const candidates: string[] = [];
  for (let i = 0; i < meaningful.length - 1; i++) candidates.push(`${meaningful[i]} ${meaningful[i + 1]}`);
  candidates.push(...meaningful.filter((w) => w.length >= 4));

  for (const c of candidates) {
    const hit = searchUniverse(c, 1)[0];
    if (hit && !found.includes(hit.display)) {
      found.push(hit.display);
      if (found.length >= max) break;
    }
  }
  return found;
}

export function classifyIntent(question: string): AssistantIntent {
  const q = question.trim().toLowerCase();
  if (!q) return { type: "UNKNOWN" };

  for (const term of Object.keys(CONCEPTS)) {
    if (q.includes(`explain ${term}`) || q === term || q.includes(`what is ${term}`) || q.includes(`what's ${term}`)) {
      return { type: "CONCEPT_EXPLAIN", term };
    }
  }

  const symbolFromText = (text: string): string | undefined => extractSymbols(text, 1)[0];

  if (/why (is|did|has)/.test(q) && /(fall|falling|fell|drop|down|rise|rising|up|surge|move|moving)/.test(q)) {
    if (q.includes("my portfolio") || q.includes("portfolio")) return { type: "PORTFOLIO_MOVE_TODAY" };
    const sym = symbolFromText(question);
    if (sym) return { type: "EXPLAIN_STOCK_MOVE", symbol: sym };
  }

  if (/(compare|vs\.?|versus)/.test(q)) {
    const symbols = extractSymbols(question, 3);
    if (symbols.length >= 2) return { type: "COMPARE_STOCKS", symbols };
  }

  if (/(should i (add|buy|sell)|can i (buy|sell|add)|(is it|good) time to (buy|sell)|worth buying|good buy|buy more|add more)/.test(q)) {
    const sym = symbolFromText(question);
    if (sym) return { type: "STOCK_DECISION", symbol: sym };
  }

  if (/(exposed|exposure|how much.*(in|to))/.test(q)) {
    const sectorWords = ["it", "banking", "bank", "auto", "pharma", "fmcg", "metal", "energy", "realty", "financial"];
    const hint = sectorWords.find((s) => q.includes(s));
    return { type: "PORTFOLIO_EXPOSURE", sectorHint: hint };
  }

  if (/(biggest risk|risky|risk in my portfolio)/.test(q)) return { type: "PORTFOLIO_RISK" };

  if (/create.*(portfolio|basket)|build.*portfolio|diversified portfolio/.test(q)) {
    const amountMatch = q.match(/(?:rs\.?|inr|₹)\s?([\d,]+)/) ?? q.match(/([\d,]+)\s?(?:rs|rupees|inr)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 10000;
    return { type: "BUILD_PORTFOLIO", amount };
  }

  const sym = symbolFromText(question);
  if (sym && /(decision|verdict|outlook|thoughts on|analy[sz]e)/.test(q)) return { type: "STOCK_DECISION", symbol: sym };
  if (sym) return { type: "EXPLAIN_STOCK_MOVE", symbol: sym };

  // Generic "about my portfolio" / "my portfolio" with no more specific verb
  // (risk/exposure/why-moving all already matched above if present) — still
  // a clear portfolio question, not nothing. Give the summary rather than
  // falling through to the generic menu.
  if (/(my portfolio|about.*portfolio)/.test(q)) return { type: "PORTFOLIO_MOVE_TODAY" };

  return { type: "UNKNOWN" };
}

export function explainConcept(term: string): string {
  return CONCEPTS[term] ?? "I don't have a built-in explanation for that term yet, but you can ask about PE ratio, ROE, ROCE, market cap, RSI, MACD, XIRR, CAGR, SIP, dividend yield, debt-to-equity, beta or volatility.";
}

export function isLlmConfigured(): boolean {
  return Boolean(env.openAiKey || env.anthropicKey);
}

/**
 * Optional prose smoothing via a configured LLM. The structured facts (numbers,
 * decision, evidence) are always computed by our own engines first; this call
 * only rewrites them into more natural sentences and is skipped entirely when
 * no key is configured — the structured answer is returned as-is.
 */
export async function smoothWithLlm(structuredAnswer: string, question: string): Promise<string> {
  if (!env.openAiKey) return structuredAnswer;
  try {
    const axios = (await import("axios")).default;
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: env.openAiModel,
        messages: [
          {
            role: "system",
            content:
              "You are StockPulse's investment assistant. Rewrite the given factual answer in clear, concise prose for a retail investor. Do NOT add any numbers, facts, or claims that are not already present in the input. Keep all figures exactly as given. Keep it under 120 words.",
          },
          { role: "user", content: `Question: ${question}\n\nFactual answer to rewrite:\n${structuredAnswer}` },
        ],
        temperature: 0.3,
        max_tokens: 300,
      },
      { headers: { Authorization: `Bearer ${env.openAiKey}` }, timeout: 15000 }
    );
    const text = res.data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : structuredAnswer;
  } catch {
    return structuredAnswer;
  }
}

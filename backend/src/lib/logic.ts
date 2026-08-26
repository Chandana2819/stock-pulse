export type AnalysisResult = {
  risk: "High" | "Medium" | "Low" | "Invalid" | "Error";
  suggestion: string;
  action: "BUY" | "SELL" | "HOLD" | "BUY (risky)" | "NOT FOUND" | "ERROR";
  reason: string;
  signal: "bullish" | "bearish" | "neutral";
  alertLevel: "danger" | "warning" | "success" | "info";
};

export function analyzeLogic(stock: string, price: number, prevClose?: number): AnalysisResult {
  const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  // Strong bearish signal
  if (change <= -5) {
    return {
      risk: "High",
      suggestion: "Market is falling sharply. Avoid new entries.",
      action: "SELL",
      reason: `Stock dropped ${Math.abs(change).toFixed(2)}% — possible panic sell or bad news.`,
      signal: "bearish",
      alertLevel: "danger",
    };
  }

  // Moderate bearish
  if (change <= -2) {
    return {
      risk: "High",
      suggestion: "Stock is under pressure. Wait for stabilization.",
      action: "HOLD",
      reason: `Down ${Math.abs(change).toFixed(2)}% today. Monitor closely.`,
      signal: "bearish",
      alertLevel: "warning",
    };
  }

  // Strong bullish
  if (change >= 5) {
    return {
      risk: "Medium",
      suggestion: "Strong momentum. Consider booking partial profits.",
      action: "SELL",
      reason: `Up ${change.toFixed(2)}% today — near-term top possible.`,
      signal: "bullish",
      alertLevel: "success",
    };
  }

  // Price-based fallback
  if (price < 100) {
    return {
      risk: "High",
      suggestion: "Small investment only. High volatility penny stock.",
      action: "BUY (risky)",
      reason: "Low price, high volatility. Speculative entry.",
      signal: "neutral",
      alertLevel: "warning",
    };
  }

  if (price < 500) {
    return {
      risk: "Medium",
      suggestion: "Good for swing trading with stop-loss.",
      action: "BUY",
      reason: "Stable mid-range stock with reasonable momentum.",
      signal: "bullish",
      alertLevel: "success",
    };
  }

  return {
    risk: "Low",
    suggestion: "Suitable for long-term portfolio.",
    action: "HOLD",
    reason: "Strong company at premium valuation. Hold or add on dips.",
    signal: "bullish",
    alertLevel: "info",
  };
}
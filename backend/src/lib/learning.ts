// Investor learning content: beginner -> intermediate -> advanced paths.
// Static content (no external dependency), but structured so a CMS/DB table
// could replace this file later without touching the route or the UI shape.

export type Lesson = {
  id: string;
  title: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  track: string;
  summary: string;
  body: string[]; // paragraphs
  example?: string;
  quiz: { question: string; options: string[]; correctIndex: number }[];
  related: string[]; // lesson ids
};

export const LESSONS: Lesson[] = [
  {
    id: "what-is-a-stock",
    title: "What is a stock?",
    level: "BEGINNER",
    track: "Stocks",
    summary: "Owning a stock means owning a tiny slice of a real company.",
    body: [
      "A stock (or 'share') represents a small piece of ownership in a company. When you buy one share of a company, you own a fraction of its assets, profits and voting rights.",
      "Companies sell shares to raise money for growth. In return, shareholders can benefit if the company does well — through price appreciation and dividends — but can also lose money if it does poorly.",
    ],
    example: "If a company has 1,000,000 shares and you own 100, you own 0.01% of that company.",
    quiz: [
      { question: "Owning a stock means:", options: ["Lending money to a company", "Owning a small part of a company", "A guaranteed fixed return", "A government bond"], correctIndex: 1 },
    ],
    related: ["what-is-pe-ratio", "risk-and-return"],
  },
  {
    id: "what-is-pe-ratio",
    title: "Understanding the PE ratio",
    level: "BEGINNER",
    track: "Valuation",
    summary: "PE tells you how expensive a stock is relative to its earnings.",
    body: [
      "The Price-to-Earnings (PE) ratio is calculated as Share Price ÷ Earnings Per Share. It answers: 'how many years of current profit am I paying for?'",
      "A high PE can mean investors expect strong future growth — or that the stock is simply overpriced. A low PE can mean a bargain — or a company with real problems. PE only means something when compared: to the company's own history, and to its sector average.",
    ],
    example: "A stock trading at ₹500 with EPS of ₹25 has a PE of 20 — you're paying 20x its current annual profit.",
    quiz: [
      { question: "A very high PE ratio, by itself, means:", options: ["The stock is definitely a good buy", "The stock is definitely overpriced", "It could mean either growth expectations or overvaluation — context is needed", "The company has no debt"], correctIndex: 2 },
    ],
    related: ["what-is-roe", "sector-pe-comparison"],
  },
  {
    id: "what-is-roe",
    title: "Return on Equity (ROE)",
    level: "BEGINNER",
    track: "Fundamentals",
    summary: "ROE shows how efficiently a company turns shareholder money into profit.",
    body: [
      "ROE = Net Profit ÷ Shareholder Equity. It measures management's skill at generating profit from the capital shareholders have put in.",
      "For Indian large-caps, an ROE consistently above ~15% is often considered healthy, but capital-heavy businesses (banks, utilities) and asset-light businesses (IT, FMCG) run at structurally different levels — always compare within the same sector.",
    ],
    quiz: [
      { question: "ROE measures:", options: ["Total company revenue", "How efficiently equity capital is turned into profit", "The stock's daily price change", "Dividend payout ratio"], correctIndex: 1 },
    ],
    related: ["what-is-pe-ratio", "debt-and-leverage"],
  },
  {
    id: "risk-and-return",
    title: "Risk and return go together",
    level: "BEGINNER",
    track: "Risk",
    summary: "Higher potential returns almost always come with higher potential losses.",
    body: [
      "Every investment carries some risk — the chance that its actual return differs from what you expected, including the risk of losing money.",
      "Generally, asset classes with higher historical average returns (small-cap stocks) also have higher volatility than lower-return ones (government bonds, large-cap stocks). Understanding your own risk tolerance and time horizon is the first step before picking investments.",
    ],
    quiz: [
      { question: "A key rule of investing risk is:", options: ["Higher return always means zero extra risk", "Risk and potential return are generally linked", "Only mutual funds carry risk", "Diversification increases risk"], correctIndex: 1 },
    ],
    related: ["what-is-diversification", "what-is-volatility"],
  },
  {
    id: "what-is-diversification",
    title: "Why diversification matters",
    level: "BEGINNER",
    track: "Portfolio",
    summary: "Not putting all your eggs in one basket, quantified.",
    body: [
      "Diversification means spreading investments across different stocks, sectors and asset classes so that a problem in any single one doesn't sink your entire portfolio.",
      "It doesn't guarantee profits or eliminate risk, but it reduces the impact of any single bad outcome — which is why concentration limits (e.g. 'no more than ~20% in one stock') are common portfolio guardrails.",
    ],
    quiz: [
      { question: "Diversification primarily helps by:", options: ["Guaranteeing higher returns", "Reducing the impact of any single position going wrong", "Eliminating all market risk", "Increasing trading fees"], correctIndex: 1 },
    ],
    related: ["risk-and-return", "sector-concentration"],
  },
  {
    id: "what-is-sip",
    title: "SIP: investing a fixed amount regularly",
    level: "BEGINNER",
    track: "Mutual Funds",
    summary: "A disciplined way to invest without trying to time the market.",
    body: [
      "A Systematic Investment Plan (SIP) means investing a fixed sum at regular intervals — usually monthly — into a mutual fund or stock, regardless of the price that day.",
      "Because you buy more units when prices are low and fewer when prices are high, your average purchase cost smooths out over time. This is called rupee-cost averaging, and it removes the pressure of trying to pick the 'perfect' entry point.",
    ],
    quiz: [
      { question: "SIP investing helps mainly by:", options: ["Timing the market perfectly", "Averaging your purchase cost over time through regular investing", "Guaranteeing fixed returns", "Avoiding all fund expenses"], correctIndex: 1 },
    ],
    related: ["what-is-xirr", "what-is-a-stock"],
  },
  {
    id: "what-is-xirr",
    title: "XIRR vs CAGR",
    level: "INTERMEDIATE",
    track: "Portfolio",
    summary: "XIRR handles the irregular cash flows a real portfolio actually has.",
    body: [
      "CAGR assumes a single lump-sum investment growing steadily to a final value — clean, but unrealistic for most real portfolios.",
      "XIRR (Extended Internal Rate of Return) accounts for multiple investments and withdrawals made on different dates, which is what actually happens with SIPs, top-ups and partial sales. It answers: 'what single annualised rate would explain everything that happened to my money?'",
    ],
    quiz: [
      { question: "XIRR is more appropriate than CAGR when:", options: ["You made a single lump-sum investment", "You made multiple investments/withdrawals on different dates", "You never sold anything", "The investment period is under a year"], correctIndex: 1 },
    ],
    related: ["what-is-sip"],
  },
  {
    id: "sector-pe-comparison",
    title: "Comparing PE within a sector",
    level: "INTERMEDIATE",
    track: "Valuation",
    summary: "A PE of 30 can be cheap or expensive depending on the sector.",
    body: [
      "IT services companies and consumer staples typically trade at different average PEs than capital-intensive businesses like PSU banks or metals — driven by differences in growth, capital needs and earnings stability.",
      "A useful valuation check compares a stock's PE to its own 5-year historical average and to its closest listed peers, rather than to an arbitrary 'good' number.",
    ],
    quiz: [
      { question: "The most meaningful PE comparison is usually:", options: ["Against any random stock", "Against the stock's own history and its direct sector peers", "Against gold prices", "There is no meaningful comparison"], correctIndex: 1 },
    ],
    related: ["what-is-pe-ratio"],
  },
  {
    id: "debt-and-leverage",
    title: "Debt-to-Equity and financial risk",
    level: "INTERMEDIATE",
    track: "Fundamentals",
    summary: "How much of the company is funded by borrowed money.",
    body: [
      "Debt-to-Equity = Total Debt ÷ Shareholder Equity. A lower ratio generally means less reliance on borrowed money and lower financial risk in a downturn, since debt must be repaid regardless of how the business is performing.",
      "Some sectors (banks, utilities, infrastructure) structurally run higher leverage as part of their business model — always compare within the sector.",
    ],
    quiz: [
      { question: "A high Debt-to-Equity ratio primarily indicates:", options: ["High dividend yield", "Greater reliance on borrowed capital, and higher financial risk", "Strong brand value", "Low market capitalisation"], correctIndex: 1 },
    ],
    related: ["what-is-roe"],
  },
  {
    id: "what-is-volatility",
    title: "Volatility: measuring how much prices swing",
    level: "INTERMEDIATE",
    track: "Risk",
    summary: "Volatility is about the size of price swings, not their direction.",
    body: [
      "Volatility measures how much a price moves over a period, typically expressed as an annualised percentage derived from daily returns. It doesn't tell you direction — only how big the swings tend to be.",
      "Higher volatility means larger potential drawdowns and larger potential gains in the same period. Position sizing and diversification are the usual tools to manage exposure to high-volatility stocks.",
    ],
    quiz: [
      { question: "High volatility means:", options: ["The stock will definitely fall", "Larger price swings in both directions", "The company has no debt", "Guaranteed high returns"], correctIndex: 1 },
    ],
    related: ["risk-and-return"],
  },
  {
    id: "sector-concentration",
    title: "Sector concentration risk",
    level: "ADVANCED",
    track: "Portfolio",
    summary: "Even a 'diversified' portfolio can be secretly concentrated by sector.",
    body: [
      "Owning 10 different stocks doesn't guarantee diversification if 7 of them are all IT services companies — they tend to move together on the same macro triggers (US tech spending, the rupee, wage inflation).",
      "A portfolio health check should look at both individual-stock concentration and sector-level concentration, and stress-test what happens if that sector underperforms.",
    ],
    quiz: [
      { question: "A portfolio of 10 stocks, 7 of them in IT, is:", options: ["Fully diversified because there are 10 stocks", "Concentrated in IT sector risk despite the stock count", "Risk-free", "Guaranteed to outperform"], correctIndex: 1 },
    ],
    related: ["what-is-diversification"],
  },
  {
    id: "technical-analysis-basics",
    title: "Technical analysis: trend, RSI and MACD",
    level: "ADVANCED",
    track: "Technical Analysis",
    summary: "Reading price and momentum, not just fundamentals.",
    body: [
      "Technical analysis studies price and volume patterns rather than company fundamentals. Moving averages (SMA/EMA) smooth out noise to reveal trend direction; RSI measures momentum extremes; MACD tracks the relationship between fast and slow trend.",
      "None of these predict the future with certainty — they describe the current state of supply/demand and are best used alongside fundamentals and risk management, not as a standalone signal.",
    ],
    quiz: [
      { question: "Technical analysis is primarily based on:", options: ["Company balance sheets", "Price and volume patterns", "Management interviews", "GDP data"], correctIndex: 1 },
    ],
    related: ["what-is-volatility"],
  },
  {
    id: "behavioral-finance-basics",
    title: "Behavioral finance: your own biggest risk",
    level: "ADVANCED",
    track: "Behavioral Finance",
    summary: "Most investors underperform their own investments because of behavior, not selection.",
    body: [
      "Loss aversion (losses hurt roughly twice as much as equivalent gains feel good) and recency bias (overweighting what just happened) push people to sell winners too early and hold losers too long, or chase stocks right after they've already rallied.",
      "Keeping a written investment thesis for every trade — and checking new information against that thesis, not against the current price — is one of the most effective countermeasures.",
    ],
    quiz: [
      { question: "A common behavioral bias in investing is:", options: ["Always being perfectly rational", "Loss aversion — losses feel worse than equivalent gains feel good", "Ignoring price completely", "Never checking a portfolio"], correctIndex: 1 },
    ],
    related: ["sector-concentration"],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsByLevel(level?: Lesson["level"]): Lesson[] {
  return level ? LESSONS.filter((l) => l.level === level) : LESSONS;
}

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
    related: ["what-is-pe-ratio", "risk-and-return", "market-cap-categories", "order-types"],
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
    related: ["what-is-xirr", "what-is-a-stock", "index-vs-active-funds", "power-of-compounding"],
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
    related: ["risk-and-return", "india-vix-explained", "backtesting-limits"],
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
    related: ["what-is-diversification", "market-breadth"],
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
    related: ["what-is-volatility", "support-and-resistance", "candlestick-basics", "moving-average-crossovers"],
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
  {
    id: "signal-taxonomy",
    title: "Understanding your signal: STRONG BUY to STRONG SELL",
    level: "BEGINNER",
    track: "Signals",
    summary: "The model's call is a seven-step scale, not a single yes/no.",
    body: [
      "Every signal you see — STRONG BUY, BUY, HOLD, REDUCE, SELL, STRONG SELL, or WAIT — comes from a single 0-100 composite score. Higher scores skew toward BUY-side calls, lower scores toward SELL-side calls, and the middle of the range is HOLD.",
      "REDUCE and SELL are different in degree, not just label: REDUCE suggests trimming part of a position, while SELL/STRONG SELL point toward exiting it. Treat the scale as a spectrum of conviction, not a single switch — a BUY at score 66 and a STRONG BUY at score 92 are both 'buy-side', but the model is far more confident in the second.",
    ],
    quiz: [
      { question: "REDUCE and SELL differ mainly in:", options: ["REDUCE means buy more", "Degree — REDUCE suggests trimming, SELL suggests exiting", "They are identical signals", "REDUCE only applies to mutual funds"], correctIndex: 1 },
    ],
    related: ["what-is-wait-signal", "confidence-score"],
  },
  {
    id: "what-is-wait-signal",
    title: "What does a WAIT signal mean?",
    level: "BEGINNER",
    track: "Signals",
    summary: "WAIT is a safety override, not a seventh point on the buy-sell scale.",
    body: [
      "WAIT fires when a safety check overrides what would otherwise be a directional call — most often when overall market risk is elevated, or when a stock's own trend is unstable enough that acting on the raw score right now looks unwise.",
      "It's best read as 'the model is deliberately not taking a position here', not as a bearish call. A WAIT can flip to BUY or SELL as soon as the condition that triggered it clears, without anything about the underlying stock actually changing.",
    ],
    quiz: [
      { question: "A WAIT signal most often means:", options: ["The stock is a guaranteed sell", "A safety override is holding back what would otherwise be a directional call", "The stock has no data at all", "It is identical to a HOLD"], correctIndex: 1 },
    ],
    related: ["signal-taxonomy", "india-vix-explained"],
  },
  {
    id: "confidence-score",
    title: "Reading a confidence score",
    level: "BEGINNER",
    track: "Signals",
    summary: "Confidence is about data quality and pillar agreement, not predicted accuracy.",
    body: [
      "The confidence percentage shown next to a signal reflects how much usable data went into the call, and how well the different pillars (trend, momentum, fundamentals, sentiment, risk) agree with each other — not a probability that the price will move as expected.",
      "A high-confidence SELL and a low-confidence SELL can both be wrong; the difference is that the high-confidence one was built on more complete, more mutually-consistent data. Low confidence is a cue to look at the reasons listed underneath before acting, not a cue to ignore the signal entirely.",
    ],
    quiz: [
      { question: "A high confidence score mainly tells you:", options: ["The stock will definitely move as predicted", "The signal is built on complete data where the pillars broadly agree", "The stock has high trading volume only", "Confidence and score are the same number"], correctIndex: 1 },
    ],
    related: ["signal-taxonomy"],
  },
  {
    id: "entry-stop-target",
    title: "Entry zone, stop-loss and target range, explained",
    level: "INTERMEDIATE",
    track: "Signals",
    summary: "Three numbers that turn a signal into an actual, risk-bounded plan.",
    body: [
      "The entry zone is a price band, not one exact number — it acknowledges that you won't always transact at the precise price a signal was generated at. The stop-loss is the price at which the original thesis is considered wrong, set below recent support with room for normal noise, not at an arbitrary round number.",
      "The target range is where the risk/reward setup looks favorable given current momentum and resistance — it is a plan, not a prediction. A position without a stop-loss has no defined point at which you'll admit the thesis failed, which is exactly the gap that turns a small loss into a large one.",
    ],
    example: "Entry ₹100-102, stop-loss ₹92, target ₹115-120 means: the setup is only being risked to about ₹9-10 a share to aim for roughly ₹14-18 — a defined risk/reward ratio, not a guess.",
    quiz: [
      { question: "A stop-loss level primarily marks:", options: ["The price you're guaranteed to sell at instantly", "The point at which the original thesis is considered wrong", "The company's book value", "The average of the 52-week range"], correctIndex: 1 },
    ],
    related: ["signal-taxonomy", "what-is-volatility"],
  },
  {
    id: "india-vix-explained",
    title: "India VIX and market-wide risk",
    level: "INTERMEDIATE",
    track: "Risk",
    summary: "A single number for how much fear is priced into the whole market right now.",
    body: [
      "India VIX is derived from NIFTY index option prices and reflects the market's expectation of volatility over the next 30 days — it is often called the 'fear gauge'. A rising VIX means option markets are pricing in bigger expected swings; a falling VIX means calmer expectations.",
      "VIX doesn't say which direction the market will move, only how much movement is being priced in. A spike in VIX often precedes sharp moves in either direction, which is why elevated VIX is one of the inputs that can push individual stock signals toward WAIT even when a stock's own chart looks fine.",
    ],
    quiz: [
      { question: "A rising India VIX indicates:", options: ["The market is guaranteed to fall", "Option markets are pricing in larger expected price swings", "Company earnings are improving", "Trading volume has dropped to zero"], correctIndex: 1 },
    ],
    related: ["what-is-volatility", "what-is-wait-signal"],
  },
  {
    id: "fii-dii-flows",
    title: "FII/DII flows: who's buying, who's selling",
    level: "INTERMEDIATE",
    track: "Market",
    summary: "Two large groups of investors whose net buying or selling moves the whole index.",
    body: [
      "FIIs (Foreign Institutional Investors) and DIIs (Domestic Institutional Investors — mutual funds, insurers, pension funds) publish their net daily buy/sell figures. When FIIs are net sellers for a stretch, it's often tied to global rate moves, currency swings, or a shift out of emerging markets generally, not necessarily anything specific to Indian companies.",
      "DII flows have grown large enough in recent years to offset FII selling on many days — a market that holds up despite FII outflows is often a sign of steady domestic buying underneath. Neither flow predicts the next day's move on its own; they're context for why the broad market is behaving the way it is.",
    ],
    quiz: [
      { question: "Sustained FII net selling is most often driven by:", options: ["A single company's quarterly results", "Broader global factors like rates, currency, or emerging-market allocation shifts", "The weather", "Domestic mutual fund SIP flows"], correctIndex: 1 },
    ],
    related: ["market-breadth", "india-vix-explained"],
  },
  {
    id: "market-breadth",
    title: "Market breadth: advances vs. declines",
    level: "INTERMEDIATE",
    track: "Market",
    summary: "How many stocks are actually participating in a move, not just the index number.",
    body: [
      "Market breadth compares the number of advancing stocks to declining stocks on a given day. An index can be up while breadth is weak — meaning the gain is concentrated in a handful of large-weight stocks while most stocks in the market actually fell.",
      "Weak breadth during an index rally is often read as a caution sign: the move may not be broadly supported, and can reverse faster than a rally where most stocks are participating. It's one of the real, computed inputs behind this app's own market-risk score, not a cosmetic statistic.",
    ],
    quiz: [
      { question: "Weak market breadth during an index rally suggests:", options: ["Every stock in the market is rising equally", "The gain may be concentrated in a few large stocks rather than broadly shared", "The index calculation is broken", "Volume is irrelevant"], correctIndex: 1 },
    ],
    related: ["fii-dii-flows", "india-vix-explained"],
  },
  {
    id: "backtesting-limits",
    title: "Backtesting: what it can and can't tell you",
    level: "ADVANCED",
    track: "Signals",
    summary: "A real historical replay is evidence, not a preview of future performance.",
    body: [
      "A backtest replays a decision engine's rules day-by-day over real historical prices to see how it would have performed — useful because it's grounded in what actually happened, not a hypothetical. But the market conditions in that window (a particular multi-year stretch of rates, sentiment, and sector rotation) won't repeat identically, so a good historical win rate is not a promise of a similar future one.",
      "Watch for the sample size and time window a backtest covers: a short window, a small number of symbols, or a period that happened to favor one style of trading (say, a strong bull run) can all make results look better or worse than what a longer, more varied period would show. Always check what benchmark it's compared against, and over what real dates.",
    ],
    quiz: [
      { question: "A strong historical backtest result mainly tells you:", options: ["Future returns are guaranteed to match it", "How the strategy would have performed in that specific real historical window", "The stock will never fall again", "Backtests require no historical data"], correctIndex: 1 },
    ],
    related: ["what-is-volatility"],
  },
  {
    id: "goal-based-investing",
    title: "Goal-based investing: matching risk to your timeline",
    level: "BEGINNER",
    track: "Portfolio",
    summary: "The right amount of risk to take depends on when you need the money.",
    body: [
      "A goal 2 years away and a goal 15 years away should rarely use the same assumed return or the same risk level — a short runway leaves little time to recover from a bad stretch, while a long one can absorb volatility in exchange for higher expected growth.",
      "Before picking an 'expected return' number for a goal, it helps to check it against what a broad market benchmark has actually delivered historically. A target well above that isn't impossible, but it usually means taking on real extra risk — worth knowing upfront rather than discovering it after a shortfall.",
    ],
    quiz: [
      { question: "A goal with a short timeline should generally:", options: ["Assume the same risk as a 15-year goal", "Take on less risk, since there's less time to recover from a downturn", "Always use the maximum possible expected return", "Ignore the target date entirely"], correctIndex: 1 },
    ],
    related: ["risk-and-return", "power-of-compounding"],
  },
  {
    id: "support-and-resistance",
    title: "Support and resistance",
    level: "BEGINNER",
    track: "Technical Analysis",
    summary: "Price levels where a stock has repeatedly struggled to move past.",
    body: [
      "Support is a price level where a stock has historically stopped falling and bounced, as buyers stepped in. Resistance is the mirror image — a level where selling has repeatedly capped further gains. Both come from the market's collective memory of what happened at that price before.",
      "Neither level is a hard floor or ceiling — they're broken all the time, especially on high volume or after new information changes the picture. A support level that's been tested and held multiple times is generally considered more meaningful than one touched only once.",
    ],
    quiz: [
      { question: "A support level is best described as:", options: ["A guaranteed price floor that can never break", "A price where buying has historically stepped in and reversed a decline", "The company's book value per share", "A level set by a regulator"], correctIndex: 1 },
    ],
    related: ["technical-analysis-basics", "moving-average-crossovers"],
  },
  {
    id: "moving-average-crossovers",
    title: "Moving average crossovers",
    level: "INTERMEDIATE",
    track: "Technical Analysis",
    summary: "When a short-term average crosses a longer-term one, trend followers pay attention.",
    body: [
      "A moving average smooths daily price noise into a single trend line. When a faster average (like the 20-day) crosses above a slower one (like the 50-day or 200-day), it's often called a 'golden cross' and read as a bullish trend-change signal; the reverse is a 'death cross'.",
      "Crossovers are lagging by nature — they confirm a trend change has been underway for a while rather than predicting one before it starts. They tend to work best in trending markets and generate more false signals in choppy, sideways ones, which is why this app's own trend pillar weighs them alongside momentum and volume rather than in isolation.",
    ],
    quiz: [
      { question: "A moving average crossover is best understood as:", options: ["A leading indicator that predicts moves before they start", "A lagging confirmation that a trend change has already been underway", "Something that only applies to mutual funds", "A guarantee of future direction"], correctIndex: 1 },
    ],
    related: ["support-and-resistance", "technical-analysis-basics"],
  },
  {
    id: "candlestick-basics",
    title: "Candlestick basics: reading a single candle",
    level: "BEGINNER",
    track: "Technical Analysis",
    summary: "One candle packs open, high, low and close into a single shape.",
    body: [
      "A candlestick shows four numbers for a time period: the open and close (the thick 'body') and the high and low (the thin 'wicks' above and below). A green/filled body usually means the close was higher than the open; a red/hollow body means the opposite.",
      "A long body signals strong conviction in that direction over the period; long wicks with a small body show a lot of back-and-forth that ultimately went nowhere. Single candles are a starting point for reading price action — they're far more informative viewed in sequence, alongside volume and trend, than in isolation.",
    ],
    quiz: [
      { question: "The thick 'body' of a candlestick represents:", options: ["The day's trading volume", "The range between the open and close price", "The company's market capitalization", "The 52-week high and low"], correctIndex: 1 },
    ],
    related: ["support-and-resistance", "technical-analysis-basics"],
  },
  {
    id: "market-cap-categories",
    title: "Market cap categories: large, mid and small cap",
    level: "BEGINNER",
    track: "Stocks",
    summary: "Company size changes what kind of risk and liquidity you're taking on.",
    body: [
      "Market capitalization (share price × total shares) is used to bucket companies into large-cap, mid-cap and small-cap. In India, SEBI defines these by rank — the top 100 companies by market cap are large-cap, the next 150 are mid-cap, and the rest are small-cap — not by a fixed rupee cutoff that stays the same forever.",
      "Large-caps tend to be more liquid and stable with slower growth; small-caps can grow faster but usually trade with wider bid-ask spreads, lower liquidity, and sharper drawdowns in a downturn. Position sizing and risk tolerance should generally account for which bucket a holding falls into.",
    ],
    quiz: [
      { question: "Small-cap stocks, relative to large-caps, typically have:", options: ["Lower volatility and higher liquidity", "Higher potential growth alongside lower liquidity and sharper drawdowns", "Fixed guaranteed returns", "No connection to market risk at all"], correctIndex: 1 },
    ],
    related: ["risk-and-return", "what-is-volatility"],
  },
  {
    id: "order-types",
    title: "Order types: market, limit and stop-loss orders",
    level: "BEGINNER",
    track: "Stocks",
    summary: "How you place a trade changes what price you actually get.",
    body: [
      "A market order executes immediately at the best available price — fast, but on an illiquid stock it can fill at a worse price than expected. A limit order only executes at your specified price or better, trading certainty of price for the risk of not being filled at all if the market never reaches it.",
      "A stop-loss order sits inactive until the price crosses a trigger level, at which point it typically becomes a market (or limit) order to exit — it's the order-level tool that enforces the stop-loss level a signal suggests, rather than relying on remembering to act manually.",
    ],
    quiz: [
      { question: "A limit order, compared to a market order:", options: ["Always executes instantly regardless of price", "Guarantees a specific price or better, but might not execute at all", "Can only be used for selling", "Removes all trading risk"], correctIndex: 1 },
    ],
    related: ["entry-stop-target"],
  },
  {
    id: "stcg-vs-ltcg",
    title: "STCG vs LTCG: how equity gains are taxed in India",
    level: "INTERMEDIATE",
    track: "Taxation",
    summary: "How long you hold a listed stock changes which tax rate applies to the gain.",
    body: [
      "For listed equity sold on a recognised exchange, gains are split into Short-Term Capital Gains (STCG) — for shares held under 12 months — and Long-Term Capital Gains (LTCG) — for shares held 12 months or longer. The two are taxed at different rates, and LTCG typically carries an annual exemption threshold before tax applies at all.",
      "Exact rates and exemption limits are set in the Union Budget and have changed more than once in recent years — always check the current figures from the Income Tax Department or a tax professional before filing, rather than relying on a remembered number. The holding-period distinction itself, though, is the durable part worth understanding.",
    ],
    quiz: [
      { question: "The dividing line between STCG and LTCG for listed equity is based on:", options: ["The company's sector", "How long the shares were held before sale", "The size of the gain in rupees", "Whether the stock is large-cap or small-cap"], correctIndex: 1 },
    ],
    related: ["dividends-buybacks-bonus"],
  },
  {
    id: "dividends-buybacks-bonus",
    title: "Dividends, buybacks and bonus issues",
    level: "INTERMEDIATE",
    track: "Corporate Actions",
    summary: "Three different ways a company returns value to shareholders, with different mechanics.",
    body: [
      "A dividend is a direct cash payout per share, taxable as income in the hands of the shareholder in India. A buyback is the company repurchasing its own shares from the market (or via tender), which reduces the share count and can support the price, without every shareholder needing to participate.",
      "A bonus issue gives existing shareholders additional free shares in a fixed ratio (e.g. 1:1), while a stock split divides each existing share into more shares at a proportionally lower price — both increase share count without changing the underlying value of your holding, since the per-share price adjusts down accordingly.",
    ],
    quiz: [
      { question: "A bonus issue of 1:1 primarily results in:", options: ["Your total holding value roughly doubling for free", "More shares at a proportionally lower price, with underlying value essentially unchanged", "A cash payment equal to your holding value", "A reduction in the number of shares you own"], correctIndex: 1 },
    ],
    related: ["stcg-vs-ltcg"],
  },
  {
    id: "reading-quarterly-results",
    title: "Reading a quarterly result",
    level: "INTERMEDIATE",
    track: "Fundamentals",
    summary: "The headline profit number is the last line of a much more informative story.",
    body: [
      "Revenue growth (is the top line actually expanding, and how does that compare to the same quarter last year — 'YoY' — not just the prior quarter?) and margin trends (is profit growing faster or slower than revenue?) generally matter more than the single net profit figure, which can be swung by one-off items.",
      "Management commentary and guidance for coming quarters, order books, and any change in debt levels shown in the same release often explain more about the road ahead than the historical numbers alone. A 'beat' on a number that was itself lowered by a one-off charge tells a different story than a clean beat.",
    ],
    quiz: [
      { question: "Comparing this quarter's revenue to the same quarter last year is called:", options: ["QoQ (quarter-on-quarter) comparison", "YoY (year-on-year) comparison", "A one-off adjustment", "The exemption threshold"], correctIndex: 1 },
    ],
    related: ["free-cash-flow", "what-is-roe"],
  },
  {
    id: "free-cash-flow",
    title: "Free cash flow: profit you can actually spend",
    level: "INTERMEDIATE",
    track: "Fundamentals",
    summary: "Accounting profit and actual cash generated aren't always the same thing.",
    body: [
      "Free Cash Flow (FCF) is cash generated from operations minus capital expenditure — what's left over after the business has funded the equipment, facilities and maintenance it needs to keep running. It's harder to manipulate through accounting choices than reported net profit, which can include non-cash items.",
      "A company can show a healthy net profit while generating little or negative free cash flow — often a sign that profit is tied up in receivables, inventory, or heavy ongoing capex. Consistently positive, growing FCF is generally viewed as a stronger fundamental signal than profit growth alone.",
    ],
    quiz: [
      { question: "A company with strong reported profit but weak free cash flow may have:", options: ["No real business at all", "Profit tied up in receivables, inventory, or heavy capital spending", "Zero shareholders", "A guaranteed future stock decline"], correctIndex: 1 },
    ],
    related: ["reading-quarterly-results", "debt-and-leverage"],
  },
  {
    id: "index-vs-active-funds",
    title: "Index funds vs actively managed funds",
    level: "BEGINNER",
    track: "Mutual Funds",
    summary: "Paying more for a fund manager only pays off if they beat the index after fees.",
    body: [
      "An index fund simply holds the same stocks as an index (like NIFTY 50) in the same proportions, aiming to match its return at a low expense ratio. An actively managed fund pays a manager to pick stocks in an attempt to beat the index, at a meaningfully higher expense ratio.",
      "Over long periods, a large share of actively managed equity funds underperform their benchmark index after fees — which is why 'low-cost index exposure as a core holding' is a common starting point, with active funds considered on their own individual track record rather than assumed to add value by default.",
    ],
    quiz: [
      { question: "The main structural advantage of an index fund is:", options: ["Guaranteed higher returns than any active fund", "Low cost, since it simply tracks an index instead of paying for active stock-picking", "It can never lose value", "It is not exposed to market risk"], correctIndex: 1 },
    ],
    related: ["what-is-sip"],
  },
  {
    id: "power-of-compounding",
    title: "Power of compounding and the Rule of 72",
    level: "BEGINNER",
    track: "Portfolio",
    summary: "Returns earning returns on themselves is the single biggest lever in long-term investing.",
    body: [
      "Compounding means each period's gains are reinvested and themselves start earning returns, so growth accelerates over time rather than staying linear. The effect is small in year one but becomes the dominant driver of long-term wealth the longer money stays invested — which is why starting early tends to matter more than timing the market perfectly.",
      "The Rule of 72 is a quick mental shortcut: divide 72 by an annual return percentage to estimate how many years it takes to double an investment. At 12%/year, that's roughly 6 years; at 8%/year, roughly 9 years — a rough approximation, not a precise formula, but useful for quick comparisons between assumptions.",
    ],
    example: "At an assumed 12% annual return, the Rule of 72 estimates a lump sum doubles in about 72 ÷ 12 = 6 years.",
    quiz: [
      { question: "Using the Rule of 72, an investment growing at 9%/year would roughly double in:", options: ["1 year", "About 8 years", "72 years", "It never doubles"], correctIndex: 1 },
    ],
    related: ["what-is-xirr", "goal-based-investing"],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsByLevel(level?: Lesson["level"]): Lesson[] {
  return level ? LESSONS.filter((l) => l.level === level) : LESSONS;
}

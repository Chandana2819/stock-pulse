"use client";

export type Holding = {
  stock: string;
  displaySym: string;
  exchange: "NSE" | "BSE" | "GLOBAL";
  avgPrice: number;
  quantity: number;
  currency: "INR" | "USD";
  currentPrice?: number; // Live price if available
};

type Props = {
  holdings: Holding[];
  wallet: { inr: number; usd: number };
  onSellClick: (holding: Holding) => void;
  onSymbolClick: (symbol: string) => void;
};

export default function HoldingsPortfolio({ holdings, wallet, onSellClick, onSymbolClick }: Props) {
  const getPL = (h: Holding) => {
    const currentPrice = h.currentPrice || h.avgPrice;
    const cost = h.avgPrice * h.quantity;
    const value = currentPrice * h.quantity;
    const pl = value - cost;
    const plPct = h.avgPrice > 0 ? (pl / cost) * 100 : 0;
    return { pl, plPct, value, cost };
  };

  // Group portfolio calculations by currency
  const getTotals = (curr: "INR" | "USD") => {
    let totalCost = 0;
    let totalValue = 0;
    holdings
      .filter((h) => h.currency === curr)
      .forEach((h) => {
        const { cost, value } = getPL(h);
        totalCost += cost;
        totalValue += value;
      });
    const totalPL = totalValue - totalCost;
    const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalPL, totalPLPct };
  };

  const inrTotals = getTotals("INR");
  const usdTotals = getTotals("USD");

  const fmt = (val: number, currency: "INR" | "USD") => {
    const symbol = currency === "USD" ? "$" : "₹";
    return `${symbol}${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <section className="mt-4 flex flex-col gap-5">
      <div className="font-mono text-[0.62rem] tracking-[0.15em] text-text-3 uppercase">{"// PORTFOLIO & WALLET SUMMARY"}</div>

      {/* ── Wallet Cards ── */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <div className="bg-bg-1 border border-border-custom p-6 relative overflow-hidden border-l-[3px] border-l-green-custom rounded">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-[0.6rem] tracking-[0.1em] px-[0.4rem] py-[0.15rem] font-bold bg-green-dim text-green-custom">INR WALLET</span>
            <span className="text-2xl opacity-15 font-mono font-bold">₹</span>
          </div>
          <div className="font-mono text-[1.8rem] font-bold text-text-custom mb-3">{fmt(wallet.inr, "INR")}</div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] text-text-3">
            <span>Invested: {fmt(inrTotals.totalCost, "INR")}</span>
            <span className="text-text-4 mx-1">·</span>
            <span>Current: {fmt(inrTotals.totalValue, "INR")}</span>
            {inrTotals.totalCost > 0 && (
              <>
                <span className="text-text-4 mx-1">·</span>
                <span className={`font-bold px-[0.35rem] py-[0.1rem] rounded-sm ${inrTotals.totalPL >= 0 ? "text-green-custom bg-green-dim" : "text-red-custom bg-red-dim"}`}>
                  {inrTotals.totalPL >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(inrTotals.totalPLPct).toFixed(2)}%
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-bg-1 border border-border-custom p-6 relative overflow-hidden border-l-[3px] border-l-cyan-custom rounded">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-[0.6rem] tracking-[0.1em] px-[0.4rem] py-[0.15rem] font-bold bg-cyan-custom/10 text-cyan-custom">USD WALLET</span>
            <span className="text-2xl opacity-15 font-mono font-bold">$</span>
          </div>
          <div className="font-mono text-[1.8rem] font-bold text-text-custom mb-3">{fmt(wallet.usd, "USD")}</div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[0.65rem] text-text-3">
            <span>Invested: {fmt(usdTotals.totalCost, "USD")}</span>
            <span className="text-text-4 mx-1">·</span>
            <span>Current: {fmt(usdTotals.totalValue, "USD")}</span>
            {usdTotals.totalCost > 0 && (
              <>
                <span className="text-text-4 mx-1">·</span>
                <span className={`font-bold px-[0.35rem] py-[0.1rem] rounded-sm ${usdTotals.totalPL >= 0 ? "text-green-custom bg-green-dim" : "text-red-custom bg-red-dim"}`}>
                  {usdTotals.totalPL >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(usdTotals.totalPLPct).toFixed(2)}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Holdings List ── */}
      <div className="bg-bg-1 border border-border-custom p-6 rounded">
        <div className="border-b border-border-custom pb-3 mb-4">
          <div className="font-mono text-[0.72rem] tracking-[0.15em] text-text-2">CURRENT HOLDINGS ({holdings.length})</div>
        </div>

        {holdings.length === 0 ? (
          <div className="flex flex-col items-center p-12 text-center border border-dashed border-border-bright rounded">
            <div className="font-display text-[1.2rem] tracking-[0.1em] text-text-3 mb-2">NO ACTIVE POSITIONS</div>
            <div className="font-mono text-[0.68rem] text-text-3 max-w-[400px]">
              Your virtual portfolio is empty. Search a symbol above and execute a BUY order to start trading.
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th align="left" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">STOCK</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">SHARES</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">AVG PRICE</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">CURRENT</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">INVESTED</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">MARKET VALUE</th>
                  <th align="right" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">NET P&amp;L</th>
                  <th align="center" className="font-mono text-[0.62rem] text-text-3 tracking-[0.1em] uppercase py-3 px-2 border-b border-border-custom">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const { pl, plPct, value, cost } = getPL(h);
                  const isUp = pl >= 0;
                  const displayPrice = h.currentPrice || h.avgPrice;

                  return (
                    <tr key={h.stock} className="border-b border-border-custom transition-colors duration-150 hover:bg-bg-2">
                      <td className="py-4 px-2 align-middle">
                        <div className="flex items-center gap-2">
                          <button
                            className="bg-transparent border-none font-mono font-bold text-text-custom cursor-pointer tracking-[0.05em] p-0 text-xs hover:text-green-custom hover:underline"
                            onClick={() => onSymbolClick(h.displaySym)}
                            title="Analyze stock"
                          >
                            {h.displaySym}
                          </button>
                          <span className="font-mono text-[0.55rem] text-text-3 border border-border-bright px-[0.25rem] py-[0.05rem] rounded-sm">{h.exchange}</span>
                        </div>
                      </td>
                      <td align="right" className="py-4 px-2 align-middle font-mono font-bold text-text-custom">
                        {h.quantity}
                      </td>
                      <td align="right" className="py-4 px-2 align-middle font-mono text-text-3">
                        {fmt(h.avgPrice, h.currency)}
                      </td>
                      <td align="right" className="py-4 px-2 align-middle font-mono text-text-custom">
                        {fmt(displayPrice, h.currency)}
                        {h.currentPrice && h.currentPrice !== h.avgPrice && (
                          <span className={`text-[0.65rem] ml-1 ${isUp ? "text-green-custom" : "text-red-custom"}`}>
                            {isUp ? "▲" : "▼"}
                          </span>
                        )}
                      </td>
                      <td align="right" className="py-4 px-2 align-middle font-mono text-text-custom">
                        {fmt(cost, h.currency)}
                      </td>
                      <td align="right" className="py-4 px-2 align-middle font-mono font-bold text-text-custom">
                        {fmt(value, h.currency)}
                      </td>
                      <td align="right" className={`py-4 px-2 align-middle font-mono font-bold ${isUp ? "text-green-custom" : "text-red-custom"}`}>
                        <span>{isUp ? "+" : ""}{fmt(pl, h.currency)}</span>
                        <div className="text-[0.62rem] mt-[0.15rem]">
                          {isUp ? "▲" : "▼"} {Math.abs(plPct).toFixed(2)}%
                        </div>
                      </td>
                      <td align="center" className="py-4 px-2 align-middle">
                        <button
                          className="font-mono text-[0.65rem] tracking-[0.05em] font-bold py-1 px-[0.6rem] bg-transparent border border-red-custom text-red-custom cursor-pointer transition-colors duration-150 hover:bg-red-dim"
                          onClick={() => onSellClick(h)}
                        >
                          SELL
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

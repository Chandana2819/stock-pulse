// NSE/BSE regular trading session awareness — shared by anything that needs
// to know whether prices/signals on screen are live or from the last close.
//
// Session: Monday–Friday, 9:15 AM – 3:30 PM IST. Does not account for
// exchange holidays (no holiday calendar wired up yet) — on a holiday this
// will read OPEN during session hours even though the exchange is shut.

export type MarketStatus = "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED";

export function getIndiaMarketStatus(now: Date = new Date()): MarketStatus {
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istStr);
  const day = istDate.getDay(); // 0 = Sun ... 6 = Sat
  const mins = istDate.getHours() * 60 + istDate.getMinutes();

  if (day < 1 || day > 5) return "CLOSED";
  if (mins >= 555 && mins < 930) return "OPEN"; // 9:15 AM – 3:30 PM
  if (mins >= 540 && mins < 555) return "PRE_MARKET"; // 9:00 – 9:15 AM
  if (mins >= 930 && mins < 960) return "POST_MARKET"; // 3:30 – 4:00 PM
  return "CLOSED";
}

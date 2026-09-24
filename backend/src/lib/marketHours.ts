// NSE/BSE regular trading session awareness — shared by anything that needs
// to know whether prices/signals on screen are live or from the last close.
//
// Session: Monday–Friday, 9:15 AM – 3:30 PM IST, minus the NSE-declared
// trading holidays listed below.

export type MarketStatus = "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED";

// NSE equity-segment trading holidays, by year, as "YYYY-MM-DD" (IST).
// Source: NSE's own holiday circular / groww.in's published NSE holiday
// list, cross-checked against nseindia.com's Muhurat Trading notice for the
// 2026 Diwali session. NSE publishes each year's list only a few months in
// advance, so this needs a fresh entry added every year — a year with no
// entry here just falls back to plain Mon–Fri/session-time logic (never
// throws, just isn't holiday-aware for that year).
const TRADING_HOLIDAYS: Record<string, string[]> = {
  "2026": [
    "2026-01-15", // Maharashtra Municipal Corporation Election
    "2026-01-26", // Republic Day
    "2026-03-03", // Holi
    "2026-03-26", // Ram Navami
    "2026-03-31", // Mahavir Jayanti
    "2026-04-03", // Good Friday
    "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
    "2026-05-01", // Maharashtra Day
    "2026-05-28", // Bakri Id
    "2026-06-26", // Muharram
    "2026-09-14", // Ganesh Chaturthi
    "2026-10-02", // Mahatma Gandhi Jayanti
    "2026-10-20", // Dussehra
    "2026-11-10", // Diwali-Balipratipada
    "2026-11-24", // Guru Nanak Jayanti
    "2026-12-25", // Christmas
  ],
};

function isTradingHoliday(istDate: Date): boolean {
  const year = String(istDate.getFullYear());
  const iso = `${year}-${String(istDate.getMonth() + 1).padStart(2, "0")}-${String(istDate.getDate()).padStart(2, "0")}`;
  return TRADING_HOLIDAYS[year]?.includes(iso) ?? false;
}

export function getIndiaMarketStatus(now: Date = new Date()): MarketStatus {
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istStr);
  const day = istDate.getDay(); // 0 = Sun ... 6 = Sat
  const mins = istDate.getHours() * 60 + istDate.getMinutes();

  if (day < 1 || day > 5) return "CLOSED";
  if (isTradingHoliday(istDate)) return "CLOSED";
  if (mins >= 555 && mins < 930) return "OPEN"; // 9:15 AM – 3:30 PM
  if (mins >= 540 && mins < 555) return "PRE_MARKET"; // 9:00 – 9:15 AM
  if (mins >= 930 && mins < 960) return "POST_MARKET"; // 3:30 – 4:00 PM
  return "CLOSED";
}

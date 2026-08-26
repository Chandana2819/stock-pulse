import express from "express";
import { prisma } from "../lib/prisma";
import { financialYear, financialYearRange, round } from "../lib/finance";
import { asyncHandler } from "../lib/http";

const router = express.Router();

const STCG_HOLDING_DAYS = 365; // simplified Indian equity STCG/LTCG threshold (1 year)
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes estimated capital-gains for a financial year using FIFO lot
 * matching over the user's own transaction history. This is a simplified
 * estimate for equity delivery trades — it does not model F&O, intraday
 * (speculative) treatment, grandfathering rules, or STT/surcharge nuances.
 * Always labelled as an estimate; verify with a tax professional / CA before
 * filing.
 */
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const fy = (req.query.fy as string) || financialYear(new Date());
    const { start, end } = financialYearRange(fy);

    const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } });

    const lots = new Map<string, { qty: number; price: number; date: Date }[]>();
    let stcg = 0;
    let ltcg = 0;
    const breakdown: Array<{ stock: string; type: "STCG" | "LTCG"; gain: number; sellDate: string }> = [];

    for (const t of transactions) {
      const list = lots.get(t.stock) ?? [];
      if (t.type === "BUY") {
        list.push({ qty: t.quantity, price: t.price, date: t.createdAt });
      } else {
        let remaining = t.quantity;
        while (remaining > 0 && list.length > 0) {
          const lot = list[0];
          const matched = Math.min(lot.qty, remaining);
          const gain = (t.price - lot.price) * matched;
          const holdingDays = (t.createdAt.getTime() - lot.date.getTime()) / DAY_MS;
          const isLongTerm = holdingDays >= STCG_HOLDING_DAYS;

          if (t.createdAt >= start && t.createdAt <= end) {
            if (isLongTerm) ltcg += gain;
            else stcg += gain;
            breakdown.push({ stock: t.stock, type: isLongTerm ? "LTCG" : "STCG", gain: round(gain), sellDate: t.createdAt.toISOString() });
          }

          lot.qty -= matched;
          remaining -= matched;
          if (lot.qty <= 0) list.shift();
        }
      }
      lots.set(t.stock, list);
    }

    const record = await prisma.taxRecord.upsert({
      where: { userId_financialYear: { userId: req.user!.id, financialYear: fy } },
      update: { stcg: round(stcg), ltcg: round(ltcg), realizedPnl: round(stcg + ltcg), breakdown: JSON.stringify(breakdown) },
      create: { userId: req.user!.id, financialYear: fy, stcg: round(stcg), ltcg: round(ltcg), dividendIncome: 0, realizedPnl: round(stcg + ltcg), breakdown: JSON.stringify(breakdown) },
    });

    return res.json({
      financialYear: fy,
      stcg: record.stcg,
      ltcg: record.ltcg,
      realizedPnl: record.realizedPnl,
      dividendIncome: record.dividendIncome,
      breakdown,
      disclaimer: "This is an automated ESTIMATE based on your simulated transaction history using simplified FIFO and a 1-year STCG/LTCG threshold. It does not account for grandfathering, F&O/intraday rules, or STT — verify with a tax professional before filing.",
    });
  })
);

export default router;

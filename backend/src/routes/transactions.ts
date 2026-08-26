import express from "express";
import { prisma } from "../lib/prisma";
import { executeTransaction } from "../lib/services/portfolio";
import { asyncHandler, paginate } from "../lib/http";
import { parse, v, SYMBOL_RE } from "../lib/validate";
import { pushNotification } from "../lib/services/notifications";
import { audit } from "../lib/audit";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(paginate(transactions, page, pageSize));
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { stock, type, quantity, price } = parse(
      { stock: v.string({ min: 1, max: 24, pattern: SYMBOL_RE }), type: v.enumOf(["BUY", "SELL"] as const), quantity: v.number({ min: 0.0001 }), price: v.number({ min: 0.01 }) },
      req.body
    );

    const transaction = await executeTransaction(req.user!.id, stock, type, quantity, price);
    await audit(req, "portfolio.transaction", { entity: "Transaction", entityId: transaction.id, meta: { stock, type, quantity, price } });
    await pushNotification({
      userId: req.user!.id,
      category: "ORDER",
      title: `${type === "BUY" ? "Bought" : "Sold"} ${transaction.stock}`,
      body: `${quantity} shares at ${price.toFixed(2)} (simulated order)`,
      link: `/stock/${transaction.stock}`,
    });
    return res.json(transaction);
  })
);

export default router;

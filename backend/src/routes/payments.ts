import express from "express";
import { prisma } from "../lib/prisma";
import { paymentProvider } from "../lib/providers";
import { asyncHandler, ApiError } from "../lib/http";
import { parse, v } from "../lib/validate";
import { requireRealSession } from "../middleware/auth";
import { pushNotification } from "../lib/services/notifications";
import { audit } from "../lib/audit";

const router = express.Router();
router.use(requireRealSession);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
    return res.json(payments);
  })
);

router.post(
  "/create",
  asyncHandler(async (req, res) => {
    if (!paymentProvider.configured) {
      throw ApiError.unavailable("Payments are not configured in this environment. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable real deposits/withdrawals — no payment is simulated.");
    }
    const { amount, type } = parse({ amount: v.number({ min: 1, max: 1_000_000 }), type: v.enumOf(["DEPOSIT", "WITHDRAWAL"] as const) }, req.body);

    if (type === "WITHDRAWAL") {
      // Withdrawals require a verified, primary bank account on file — never an
      // arbitrary destination — and go through manual/broker settlement outside
      // this API in a real deployment.
      const bank = await prisma.bankAccount.findFirst({ where: { userId: req.user!.id, isPrimary: true, verified: true } });
      if (!bank) throw ApiError.badRequest("Add and verify a primary bank account before requesting a withdrawal");
    }

    const intent = await paymentProvider.createIntent({ amount, currency: "INR", userRef: req.user!.id, note: `StockPulse ${type.toLowerCase()}` });
    const payment = await prisma.payment.create({
      data: { userId: req.user!.id, provider: paymentProvider.id, providerRef: intent.providerRef, type, amount, currency: "INR", status: "CREATED", meta: JSON.stringify(intent.checkout) },
    });
    await audit(req, "payment.create", { entity: "Payment", entityId: payment.id, meta: { type, amount } });
    return res.json({ paymentId: payment.id, checkout: intent.checkout });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!payment) throw ApiError.notFound("Payment not found");
    return res.json(payment);
  })
);

/** Called by the client after the provider's own checkout completes. */
router.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!payment) throw ApiError.notFound("Payment not found");
    if (!payment.providerRef) throw ApiError.badRequest("Payment was never initiated with the provider");

    const signaturePayload = { razorpay_order_id: payment.providerRef, razorpay_payment_id: String(req.body?.razorpay_payment_id ?? ""), razorpay_signature: String(req.body?.razorpay_signature ?? "") };
    const valid = paymentProvider.verifySignature(signaturePayload);
    if (!valid) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Signature verification failed" } });
      throw ApiError.badRequest("Payment verification failed");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });
      if (p.type === "DEPOSIT") {
        await tx.user.update({ where: { id: req.user!.id }, data: { walletInr: { increment: p.amount } } });
      }
      return p;
    });

    await pushNotification({ userId: req.user!.id, category: "PAYMENT", priority: "HIGH", title: `${payment.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} successful`, body: `₹${payment.amount.toFixed(2)} ${payment.type === "DEPOSIT" ? "added to" : "debited from"} your wallet.` });
    await audit(req, "payment.confirmed", { entity: "Payment", entityId: payment.id });
    return res.json(updated);
  })
);

export default router;

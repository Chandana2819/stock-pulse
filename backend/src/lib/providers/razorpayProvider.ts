import axios from "axios";
import crypto from "crypto";
import { env } from "../../config/env";
import type { PaymentIntent, PaymentProvider } from "./types";

/**
 * Razorpay order-based payments.
 *
 * Money never moves through our code: we create an order server-side, the
 * client opens Razorpay's own checkout, and we verify the signed result. We
 * never see or store a card number, CVV, UPI PIN or bank credential — those
 * stay inside the provider's PCI-compliant flow.
 *
 * When keys are absent, `configured` is false and the payments API returns 503
 * with a clear message rather than simulating a successful payment.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly id = "RAZORPAY";

  get configured() {
    return Boolean(env.razorpayKeyId && env.razorpayKeySecret);
  }

  private auth() {
    return { username: env.razorpayKeyId, password: env.razorpayKeySecret };
  }

  async createIntent(input: { amount: number; currency: string; userRef: string; note?: string }): Promise<PaymentIntent> {
    const res = await axios.post(
      "https://api.razorpay.com/v1/orders",
      {
        amount: Math.round(input.amount * 100), // paise
        currency: input.currency,
        receipt: `sp_${input.userRef}_${Date.now()}`,
        notes: { note: input.note ?? "StockPulse wallet deposit" },
      },
      { auth: this.auth(), timeout: 12000 }
    );

    const order = res.data;
    return {
      providerRef: String(order.id),
      amount: input.amount,
      currency: input.currency,
      status: String(order.status ?? "created"),
      // Only the publishable key id is exposed to the browser; the secret never leaves the server.
      checkout: { key: env.razorpayKeyId, orderId: String(order.id), amount: Number(order.amount), currency: String(order.currency) },
    };
  }

  verifySignature(payload: Record<string, string>): boolean {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return false;
    const expected = crypto
      .createHmac("sha256", env.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(razorpay_signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async getStatus(providerRef: string): Promise<string> {
    const res = await axios.get(`https://api.razorpay.com/v1/orders/${encodeURIComponent(providerRef)}`, {
      auth: this.auth(),
      timeout: 10000,
    });
    return String(res.data?.status ?? "unknown");
  }
}

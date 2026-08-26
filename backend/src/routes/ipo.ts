import express from "express";
import { ipoProvider } from "../lib/providers";
import { asyncHandler } from "../lib/http";

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status as "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | undefined;
    const listings = await ipoProvider.list(status);
    return res.json({
      configured: ipoProvider.configured,
      listings,
      note: ipoProvider.configured
        ? undefined
        : "IPO data source is not connected in this environment. Connect a licensed IPO/GMP feed in backend/src/lib/providers/ipoProvider.ts to enable this section — no data is fabricated here.",
    });
  })
);

export default router;

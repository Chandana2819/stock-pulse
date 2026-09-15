import { prisma } from "./lib/prisma";
import { lookupUniverse } from "./lib/universe";
import { resolveStockQuote } from "./lib/providers";

async function normalizeHoldings() {
  console.log("=== STARTING HOLDINGS NORMALIZATION ===");
  const holdings = await prisma.holding.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`Found ${holdings.length} holdings in total.`);

  let updatedCount = 0;
  let mergedCount = 0;

  for (const h of holdings) {
    const rawSymbol = h.stock.trim().toUpperCase();

    // Check if it's already properly suffixed
    if (rawSymbol.endsWith(".NS") || rawSymbol.endsWith(".BO")) {
      // Ensure exchange and currency are correct
      const expectedExchange = rawSymbol.endsWith(".NS") ? "NSE" : "BSE";
      if (h.exchange !== expectedExchange || h.currency !== "INR") {
        await prisma.holding.update({
          where: { id: h.id },
          data: { exchange: expectedExchange, currency: "INR" },
        });
        updatedCount++;
        console.log(`[UPDATED] ${rawSymbol}: fixed exchange=${expectedExchange}, currency=INR`);
      }
      continue;
    }

    // Check if it matches an Indian universe stock
    const uni = lookupUniverse(rawSymbol);
    let canonicalSymbol: string | null = null;
    let canonicalExchange: "NSE" | "BSE" | "GLOBAL" = "GLOBAL";
    let canonicalCurrency: "INR" | "USD" = "USD";
    let canonicalDisplay = h.displaySym || rawSymbol;

    if (uni) {
      canonicalSymbol = uni.symbol;
      canonicalExchange = uni.exchange;
      canonicalCurrency = uni.exchange === "NSE" ? "INR" : "USD";
      canonicalDisplay = uni.display;
    } else {
      // Try resolving quote
      try {
        const res = await resolveStockQuote(rawSymbol);
        if (res && res.resolved) {
          canonicalSymbol = res.resolved.providerSymbol;
          canonicalExchange = res.resolved.exchange === "BSE" ? "BSE" : res.resolved.exchange === "NSE" ? "NSE" : "GLOBAL";
          canonicalCurrency = canonicalExchange === "GLOBAL" ? "USD" : "INR";
          canonicalDisplay = res.resolved.displaySymbol;
        }
      } catch {
        // Leave as is if unresolvable
      }
    }

    if (canonicalSymbol && canonicalSymbol !== h.stock) {
      console.log(`Normalizing ${h.stock} -> ${canonicalSymbol} (User: ${h.userId})`);

      // Check if target holding already exists for this user
      const existingCanonical = await prisma.holding.findUnique({
        where: { userId_stock: { userId: h.userId, stock: canonicalSymbol } },
      });

      if (existingCanonical && existingCanonical.id !== h.id) {
        // Merge holdings
        const newQty = existingCanonical.quantity + h.quantity;
        const newAvg = (existingCanonical.avgPrice * existingCanonical.quantity + h.avgPrice * h.quantity) / newQty;
        await prisma.holding.update({
          where: { id: existingCanonical.id },
          data: {
            quantity: newQty,
            avgPrice: newAvg,
            exchange: canonicalExchange,
            currency: canonicalCurrency,
            displaySym: canonicalDisplay,
          },
        });
        await prisma.holding.delete({ where: { id: h.id } });
        mergedCount++;
        console.log(`[MERGED] Merged ${h.stock} into existing ${canonicalSymbol} (New Qty: ${newQty}, New Avg: ${newAvg.toFixed(2)})`);
      } else {
        await prisma.holding.update({
          where: { id: h.id },
          data: {
            stock: canonicalSymbol,
            displaySym: canonicalDisplay,
            exchange: canonicalExchange,
            currency: canonicalCurrency,
          },
        });
        updatedCount++;
        console.log(`[UPDATED] Renamed ${h.stock} to ${canonicalSymbol} with exchange=${canonicalExchange}, currency=${canonicalCurrency}`);
      }
    }
  }

  // Also check transactions table to normalize stock symbols
  const transactions = await prisma.transaction.findMany();
  let txUpdatedCount = 0;
  for (const t of transactions) {
    const raw = t.stock.trim().toUpperCase();
    if (!raw.endsWith(".NS") && !raw.endsWith(".BO")) {
      const uni = lookupUniverse(raw);
      if (uni && uni.exchange === "NSE") {
        await prisma.transaction.update({
          where: { id: t.id },
          data: { stock: uni.symbol, currency: "INR" },
        });
        txUpdatedCount++;
      }
    }
  }

  console.log(`=== NORMALIZATION COMPLETE ===`);
  console.log(`Holdings Updated: ${updatedCount}, Merged: ${mergedCount}`);
  console.log(`Transactions Updated: ${txUpdatedCount}`);
}

normalizeHoldings()
  .catch((e) => console.error("Normalization failed:", e))
  .finally(() => prisma.$disconnect());

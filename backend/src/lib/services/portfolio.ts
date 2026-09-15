import { prisma } from "../prisma";
import { marketDataProvider, resolveStockQuote } from "../providers";
import { lookupUniverse } from "../universe";
import { ApiError } from "../http";
import { xirr, type CashFlow } from "../finance";

export async function getUserByDeviceId(deviceId: string) {
  if (!deviceId) throw ApiError.badRequest("Device ID is required");

  let user = await prisma.user.findUnique({ where: { deviceId } });
  if (!user) {
    user = await prisma.user.create({ data: { deviceId } });
    await prisma.userProfile.create({ data: { userId: user.id } });
  }
  return user;
}

export async function ensureProfile(userId: string) {
  let profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) profile = await prisma.userProfile.create({ data: { userId } });
  return profile;
}

export async function executeTransaction(
  userId: string,
  stockSymbol: string,
  type: "BUY" | "SELL",
  quantity: number,
  price?: number,
  isVirtual = false
) {
  const rawSymbol = stockSymbol.trim().toUpperCase();

  // 1. Resolve canonical symbol, exchange, currency, and display symbol
  let stock = rawSymbol;
  let displaySym = rawSymbol.replace(/^\^/, "").replace(/\.(NS|BO)$/, "");
  let exchange: "NSE" | "BSE" | "GLOBAL" = "GLOBAL";
  let currency: "INR" | "USD" = "USD";

  const uni = lookupUniverse(rawSymbol);
  if (uni) {
    stock = uni.symbol;
    displaySym = uni.display;
    exchange = uni.exchange === "NSE" ? "NSE" : "GLOBAL";
    currency = exchange === "NSE" ? "INR" : "USD";
  } else if (rawSymbol.endsWith(".NS")) {
    stock = rawSymbol;
    exchange = "NSE";
    currency = "INR";
  } else if (rawSymbol.endsWith(".BO")) {
    stock = rawSymbol;
    exchange = "BSE";
    currency = "INR";
  } else {
    // Attempt dynamic quote resolution to detect exchange/currency
    try {
      const res = await resolveStockQuote(rawSymbol);
      if (res && res.resolved) {
        stock = res.resolved.providerSymbol;
        displaySym = res.resolved.displaySymbol;
        exchange = res.resolved.exchange === "BSE" ? "BSE" : res.resolved.exchange === "NSE" ? "NSE" : "GLOBAL";
        currency = exchange === "GLOBAL" ? "USD" : "INR";
      }
    } catch {
      // Keep fallbacks
    }
  }

  // 2. Fetch live quote to verify execution price
  let livePrice: number | null = null;
  try {
    const q = await marketDataProvider.getQuote(stock);
    if (q?.price && q.price > 0) {
      livePrice = q.price;
    }
  } catch (err) {
    console.warn(`[portfolio] Unable to fetch live quote for ${stock} during order execution:`, err);
  }

  let execPrice: number;
  if (livePrice != null) {
    // If client price is missing or deviates by > 5% from live market, enforce live market price
    if (price == null || price <= 0 || Math.abs(price - livePrice) / livePrice > 0.05) {
      execPrice = livePrice;
    } else {
      execPrice = price;
    }
  } else if (price != null && price > 0) {
    execPrice = price;
  } else {
    throw ApiError.badRequest(`Cannot determine execution price for ${displaySym}. Market quote unavailable.`);
  }

  const subtotal = execPrice * quantity;
  const fee = subtotal * 0.001; // 0.1% simulated brokerage fee
  const totalCost = type === "BUY" ? subtotal + fee : subtotal - fee;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User session not found");

    if (type === "BUY") {
      if (!isVirtual) {
        if (currency === "INR") {
          if (user.walletInr < totalCost) throw ApiError.badRequest("Insufficient INR funds");
          await tx.user.update({ where: { id: user.id }, data: { walletInr: user.walletInr - totalCost } });
        } else {
          if (user.walletUsd < totalCost) throw ApiError.badRequest("Insufficient USD funds");
          await tx.user.update({ where: { id: user.id }, data: { walletUsd: user.walletUsd - totalCost } });
        }
      }

      // Check both exact canonical stock and rawSymbol to merge legacy holdings
      let existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock } } });
      if (!existing && rawSymbol !== stock) {
        existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock: rawSymbol } } });
      }

      if (existing) {
        const newQty = existing.quantity + quantity;
        const newAvg = (existing.avgPrice * existing.quantity + execPrice * quantity) / newQty;
        await tx.holding.update({
          where: { id: existing.id },
          data: {
            stock, // ensure updated to canonical
            displaySym,
            exchange,
            currency,
            quantity: newQty,
            avgPrice: newAvg,
            source: "MANUAL",
          },
        });
      } else {
        await tx.holding.create({
          data: { userId: user.id, stock, displaySym, exchange, avgPrice: execPrice, quantity, currency, source: "MANUAL" },
        });
      }
    } else {
      let existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock } } });
      if (!existing && rawSymbol !== stock) {
        existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock: rawSymbol } } });
      }

      if (!existing || existing.quantity < quantity) throw ApiError.badRequest("Insufficient stock shares to execute sell");

      if (!isVirtual) {
        if (currency === "INR") {
          await tx.user.update({ where: { id: user.id }, data: { walletInr: user.walletInr + totalCost } });
        } else {
          await tx.user.update({ where: { id: user.id }, data: { walletUsd: user.walletUsd + totalCost } });
        }
      }

      if (existing.quantity === quantity) {
        await tx.holding.delete({ where: { id: existing.id } });
      } else {
        await tx.holding.update({ where: { id: existing.id }, data: { quantity: existing.quantity - quantity } });
      }
    }

    return tx.transaction.create({
      data: { userId: user.id, stock, type, price: execPrice, quantity, fee, totalCost, currency },
    });
  });
}

export type EnrichedHolding = Awaited<ReturnType<typeof getEnrichedHoldings>>[number];

export async function getEnrichedHoldings(userId: string) {
  const holdings = await prisma.holding.findMany({ where: { userId }, orderBy: { stock: "asc" } });
  if (holdings.length === 0) return [];

  // Map each database symbol to its proper Yahoo Finance provider symbol based on its exchange suffix or universe lookup
  const symbols = holdings.map((h) => {
    const symbol = h.stock.toUpperCase().trim();
    if (h.exchange === "NSE" && !symbol.endsWith(".NS")) {
      return `${symbol}.NS`;
    }
    if (h.exchange === "BSE" && !symbol.endsWith(".BO")) {
      return `${symbol}.BO`;
    }
    const uni = lookupUniverse(symbol);
    if (uni && uni.exchange === "NSE" && !symbol.endsWith(".NS") && !symbol.endsWith(".BO")) {
      return uni.symbol;
    }
    return symbol;
  });

  let quotes: Record<string, { price: number } | null> = {};
  try {
    quotes = await marketDataProvider.getQuotes(symbols);
  } catch (e) {
    console.error("Failed to fetch live quotes during enrichment:", e);
  }

  return holdings.map((h, i) => {
    const providerSymbol = symbols[i];
    const live = quotes[providerSymbol];
    const currentPrice = live?.price ?? null;
    const cost = h.avgPrice * h.quantity;
    const value = currentPrice != null ? currentPrice * h.quantity : null;
    const pl = currentPrice != null ? value! - cost : null;
    const plPct = (currentPrice != null && cost > 0) ? (pl! / cost) * 100 : null;
    return { ...h, currentPrice, cost, value, pl, plPct };
  });
}

/** Portfolio-wide XIRR from the user's full transaction history plus current holding value as the final "cash-in" flow. */
export async function computePortfolioXirr(userId: string): Promise<number | null> {
  const [transactions, holdings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    getEnrichedHoldings(userId),
  ]);
  if (transactions.length === 0) return null;

  const flows: CashFlow[] = transactions.map((t) => ({
    date: t.createdAt,
    amount: t.type === "BUY" ? -t.totalCost : t.totalCost,
  }));
  const currentValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
  if (currentValue > 0) flows.push({ date: new Date(), amount: currentValue });

  return xirr(flows);
}

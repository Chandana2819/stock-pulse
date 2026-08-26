import { prisma } from "../prisma";
import { marketDataProvider } from "../providers";
import { ApiError } from "../http";
import { xirr, type CashFlow } from "../finance";

export async function getUserByDeviceId(deviceId: string) {
  if (!deviceId) throw ApiError.badRequest("Device ID is required");

  let user = await prisma.user.findUnique({ where: { deviceId } });
  if (!user) {
    user = await prisma.user.create({ data: { deviceId, walletInr: 1000000.0, walletUsd: 10000.0 } });
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
  price: number
) {
  const stock = stockSymbol.toUpperCase();
  const isGlobal = !stock.endsWith(".NS") && !stock.endsWith(".BO");
  const currency = isGlobal ? "USD" : "INR";
  const exchange = stock.endsWith(".NS") ? "NSE" : stock.endsWith(".BO") ? "BSE" : "GLOBAL";
  const displaySym = stock.replace(/^\^/, "").replace(/\.(NS|BO)$/, "");

  const subtotal = price * quantity;
  const fee = subtotal * 0.001; // 0.1% simulated brokerage fee
  const totalCost = type === "BUY" ? subtotal + fee : subtotal - fee;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound("User session not found");

    if (type === "BUY") {
      if (currency === "INR") {
        if (user.walletInr < totalCost) throw ApiError.badRequest("Insufficient INR funds");
        await tx.user.update({ where: { id: user.id }, data: { walletInr: user.walletInr - totalCost } });
      } else {
        if (user.walletUsd < totalCost) throw ApiError.badRequest("Insufficient USD funds");
        await tx.user.update({ where: { id: user.id }, data: { walletUsd: user.walletUsd - totalCost } });
      }

      const existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock } } });
      if (existing) {
        const newQty = existing.quantity + quantity;
        const newAvg = (existing.avgPrice * existing.quantity + price * quantity) / newQty;
        await tx.holding.update({ where: { id: existing.id }, data: { quantity: newQty, avgPrice: newAvg } });
      } else {
        await tx.holding.create({
          data: { userId: user.id, stock, displaySym, exchange, avgPrice: price, quantity, currency },
        });
      }
    } else {
      const existing = await tx.holding.findUnique({ where: { userId_stock: { userId: user.id, stock } } });
      if (!existing || existing.quantity < quantity) throw ApiError.badRequest("Insufficient stock shares to execute sell");

      if (currency === "INR") {
        await tx.user.update({ where: { id: user.id }, data: { walletInr: user.walletInr + totalCost } });
      } else {
        await tx.user.update({ where: { id: user.id }, data: { walletUsd: user.walletUsd + totalCost } });
      }

      if (existing.quantity === quantity) {
        await tx.holding.delete({ where: { id: existing.id } });
      } else {
        await tx.holding.update({ where: { id: existing.id }, data: { quantity: existing.quantity - quantity } });
      }
    }

    return tx.transaction.create({
      data: { userId: user.id, stock, type, price, quantity, fee, totalCost, currency },
    });
  });
}

export type EnrichedHolding = Awaited<ReturnType<typeof getEnrichedHoldings>>[number];

export async function getEnrichedHoldings(userId: string) {
  const holdings = await prisma.holding.findMany({ where: { userId }, orderBy: { stock: "asc" } });
  if (holdings.length === 0) return [];

  const symbols = holdings.map((h) => h.stock);
  let quotes: Record<string, { price: number } | null> = {};
  try {
    quotes = await marketDataProvider.getQuotes(symbols);
  } catch (e) {
    console.error("Failed to fetch live quotes during enrichment:", e);
  }

  return holdings.map((h) => {
    const live = quotes[h.stock];
    const currentPrice = live?.price ?? h.avgPrice;
    const cost = h.avgPrice * h.quantity;
    const value = currentPrice * h.quantity;
    const pl = value - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
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
  const currentValue = holdings.reduce((sum, h) => sum + h.value, 0);
  if (currentValue > 0) flows.push({ date: new Date(), amount: currentValue });

  return xirr(flows);
}

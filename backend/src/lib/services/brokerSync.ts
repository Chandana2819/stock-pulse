import { prisma } from "../prisma";
import { getBroker, marketDataProvider } from "../providers";
import { decryptSecret } from "../crypto";

export async function syncUserBroker(userId: string, brokerId: string) {
  const provider = getBroker(brokerId.toUpperCase());
  if (!provider) throw new Error(`Unsupported broker: ${brokerId}`);

  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId, broker: provider.id } }
  });
  if (!conn || conn.status !== "CONNECTED" || !conn.accessTokenEnc) {
    throw new Error("Broker is not connected");
  }

  // Check expiration of access token
  if (conn.expiresAt && conn.expiresAt < new Date()) {
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { status: "DISCONNECTED", lastError: "Session expired. Please reconnect." }
    });
    throw new Error("Session expired. Please reconnect.");
  }

  try {
    const accessToken = conn.accessTokenEnc.startsWith("mock_")
      ? conn.accessTokenEnc
      : decryptSecret(conn.accessTokenEnc);

    const [holdings, orders] = await Promise.all([
      provider.getHoldings(accessToken),
      provider.getOrders(accessToken)
    ]);

    // Save synced holdings to database Holding table
    // Delete old holdings that are not present in the new sync for this broker
    const newSymbols = new Set(holdings.map((h) => h.symbol.toUpperCase().trim()));
    
    await prisma.holding.deleteMany({
      where: {
        userId,
        broker: provider.id,
        NOT: { stock: { in: Array.from(newSymbols) } }
      }
    });

    for (const h of holdings) {
      const symbol = h.symbol.toUpperCase().trim();
      const exchange = h.exchange.toUpperCase() === "GLOBAL" ? "GLOBAL" : "NSE";
      const currency = exchange === "GLOBAL" ? "USD" : "INR";
      const displaySym = symbol.replace(/\.(NS|BO)$/, "");

      await prisma.holding.upsert({
        where: { userId_stock: { userId, stock: symbol } },
        update: {
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          exchange,
          currency,
          displaySym,
          source: "CONNECTED",
          broker: provider.id
        },
        create: {
          userId,
          stock: symbol,
          quantity: h.quantity,
          avgPrice: h.avgPrice,
          exchange,
          currency,
          displaySym,
          source: "CONNECTED",
          broker: provider.id
        }
      });

      // Seed today's close price in StockPrice table from a live quote so
      // portfolio P&L and signals reflect the real market, not a stale value.
      const quote = await marketDataProvider.getQuote(symbol).catch(() => null);
      const currentPrice = quote && quote.price > 0 ? quote.price : h.avgPrice;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.stockPrice.upsert({
        where: { symbol_date: { symbol, date: today } },
        update: {
          open: quote?.open ?? currentPrice,
          high: quote?.dayHigh ?? currentPrice,
          low: quote?.dayLow ?? currentPrice,
          close: currentPrice,
          volume: quote?.volume ?? 1000
        },
        create: {
          symbol,
          date: today,
          open: quote?.open ?? currentPrice,
          high: quote?.dayHigh ?? currentPrice,
          low: quote?.dayLow ?? currentPrice,
          close: currentPrice,
          volume: quote?.volume ?? 1000
        }
      });
    }

    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastError: null }
    });

    return { holdings, orders };
  } catch (err: any) {
    const message = err.message || "Sync failed";
    
    // Check if error indicates session expiration
    const lowerMessage = message.toLowerCase();
    const isExpired = lowerMessage.includes("expired") || lowerMessage.includes("token") || lowerMessage.includes("auth");
    
    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: {
        lastError: message,
        status: isExpired ? "DISCONNECTED" : "ERROR"
      }
    });
    throw err;
  }
}

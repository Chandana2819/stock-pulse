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

    // Sequential calls — Render.com lacks IPv6 outbound routing; concurrent
    // requests trigger ETIMEDOUT / ENETUNREACH against api.kite.trade (Cloudflare).
    // Running one at a time is far more reliable on free-tier cloud instances.
    const holdings = await provider.getHoldings(accessToken);
    const orders = await provider.getOrders(accessToken);
    const mfHoldings = provider.getMfHoldings
      ? await provider.getMfHoldings(accessToken)
      : [];

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
    }

    // Save synced mutual fund holdings
    if (mfHoldings && mfHoldings.length > 0) {
      for (const mf of mfHoldings) {
        const schemeCode = mf.schemeCode || "";
        const folioNumber = mf.folio || "";
        if (!schemeCode) continue;

        await prisma.mfHolding.upsert({
          where: {
            userId_schemeCode_folioNumber: {
              userId,
              schemeCode,
              folioNumber,
            },
          },
          update: {
            schemeName: mf.schemeName,
            units: mf.units,
            avgNav: mf.avgPrice,
            invested: mf.units * mf.avgPrice,
            source: "BROKER",
            broker: provider.id,
          },
          create: {
            userId,
            schemeCode,
            schemeName: mf.schemeName,
            folioNumber,
            units: mf.units,
            avgNav: mf.avgPrice,
            invested: mf.units * mf.avgPrice,
            source: "BROKER",
            broker: provider.id,
          },
        });
      }
    }

    await prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastError: null }
    });

    return { holdings, orders, mfHoldings: mfHoldings ?? [] };
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

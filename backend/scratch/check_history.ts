import { prisma } from "../src/lib/prisma";

async function main() {
  const count = await prisma.recommendationHistory.count();
  const oldest = await prisma.recommendationHistory.findFirst({ orderBy: { generatedAt: "asc" } });
  const newest = await prisma.recommendationHistory.findFirst({ orderBy: { generatedAt: "desc" } });
  const distinctSymbols = await prisma.recommendationHistory.groupBy({ by: ["symbol"], _count: true });
  const buyCount = await prisma.recommendationHistory.count({ where: { action: { contains: "BUY" } } });
  const stockPriceCount = await prisma.stockPrice.count();
  const nifty = await prisma.stockPrice.count({ where: { symbol: "^NSEI" } });
  console.log(JSON.stringify({ count, oldest: oldest?.generatedAt, newest: newest?.generatedAt, distinctSymbolCount: distinctSymbols.length, buyCount, stockPriceCount, niftyStockPriceRows: nifty }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

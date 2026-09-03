import { prisma } from "../src/lib/prisma";

async function main() {
  const holdings = await prisma.holding.groupBy({ by: ["stock"], _count: true });
  const watchlist = await prisma.watchlistItem.groupBy({ by: ["symbol"], _count: true });
  const notifCountBefore = await prisma.notification.count();
  console.log(JSON.stringify({ holdings, watchlist, notifCountBefore }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

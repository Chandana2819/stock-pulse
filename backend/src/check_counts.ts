import { prisma } from "./lib/prisma";

async function main() {
  const recommendations = await prisma.stockRecommendation.findMany();
  console.log("TOTAL RECOMMENDATIONS:", recommendations.length);
  for (const r of recommendations) {
    console.log(`- ${r.symbol}: ${r.action}`);
  }

  const users = await prisma.user.findMany();
  console.log("\nUSERS:");
  for (const u of users) {
    const holdings = await prisma.holding.findMany({ where: { userId: u.id } });
    console.log(`User ${u.id} (${u.username || "anonymous"}):`);
    for (const h of holdings) {
      console.log(`  - ${h.stock}: Qty ${h.quantity}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

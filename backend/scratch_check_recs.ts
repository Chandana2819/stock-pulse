import { prisma } from "./src/lib/prisma";

async function main() {
  const count = await prisma.stockRecommendation.count();
  console.log("Total stockRecommendation:", count);
  const sample = await prisma.stockRecommendation.findFirst();
  console.log("Sample recommendation:", sample);

  const marketRisk = await prisma.marketRisk.findFirst({ orderBy: { createdAt: "desc" } });
  console.log("Latest marketRisk:", marketRisk);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

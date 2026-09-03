import { prisma } from "../src/lib/prisma";

function directionBucket(action: string): string {
  if (action.includes("BUY")) return "BUY";
  if (action.includes("SELL") || action === "REDUCE") return "SELL";
  if (action === "HOLD") return "HOLD";
  return "WAIT";
}

async function main() {
  const symbols = await prisma.recommendationHistory.groupBy({ by: ["symbol"] });
  let changedCount = 0;
  let bucketChangedCount = 0;
  const examples: any[] = [];

  for (const { symbol } of symbols) {
    const last2 = await prisma.recommendationHistory.findMany({
      where: { symbol },
      orderBy: { generatedAt: "desc" },
      take: 2,
      select: { action: true, generatedAt: true },
    });
    if (last2.length < 2) continue;
    if (last2[0].action !== last2[1].action) {
      changedCount++;
      const oldB = directionBucket(last2[1].action);
      const newB = directionBucket(last2[0].action);
      if (oldB !== newB && oldB !== "WAIT" && newB !== "WAIT") {
        bucketChangedCount++;
        examples.push({ symbol, from: last2[1].action, to: last2[0].action });
      }
    }
  }
  console.log(JSON.stringify({ totalSymbols: symbols.length, changedCount, bucketChangedCount, examples }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

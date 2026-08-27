import { prisma } from "./lib/prisma";

async function main() {
  const holdings = await prisma.holding.findMany();
  console.log("TOTAL HOLDINGS:", holdings.length);
  for (const h of holdings) {
    console.log(`- userId: ${h.userId}, stock: ${h.stock}, qty: ${h.quantity}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

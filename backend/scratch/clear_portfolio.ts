import { prisma } from "../src/lib/prisma";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const holdingsDel = await prisma.holding.deleteMany({});
  const txDel = await prisma.transaction.deleteMany({});
  console.log(`Successfully deleted ${holdingsDel.count} holdings and ${txDel.count} transactions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

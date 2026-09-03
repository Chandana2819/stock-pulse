import { prisma } from "../src/lib/prisma";
import { env } from "../src/config/env";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  if (env.isProd) {
    console.error("Refusing to run: this wipes EVERY user's holdings and transactions and NODE_ENV=production. If you really mean to do this, run it with NODE_ENV unset/development.");
    process.exit(1);
  }
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

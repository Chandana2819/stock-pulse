import { prisma } from "../src/lib/prisma";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      walletInr: 0.0,
      walletUsd: 0.0,
    },
  });
  console.log(`Successfully reset virtual wallets for ${result.count} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

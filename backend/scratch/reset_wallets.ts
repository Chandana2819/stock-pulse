import { prisma } from "../src/lib/prisma";
import { env } from "../src/config/env";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  if (env.isProd) {
    console.error("Refusing to run: this zeroes EVERY user's wallet and NODE_ENV=production. If you really mean to do this, run it with NODE_ENV unset/development.");
    process.exit(1);
  }
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

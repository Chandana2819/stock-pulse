import { backfillStock } from "../src/lib/services/scanner";
import { prisma } from "../src/lib/prisma";

async function main() {
  const ok = await backfillStock("^NSEI");
  const count = await prisma.stockPrice.count({ where: { symbol: "^NSEI" } });
  console.log(JSON.stringify({ ok, count }));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

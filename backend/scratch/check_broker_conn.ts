import { prisma } from "../src/lib/prisma";

async function main() {
  const conns = await prisma.brokerConnection.findMany({
    orderBy: { updatedAt: "desc" },
  });
  console.log(JSON.stringify({ now: new Date().toISOString(), conns }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

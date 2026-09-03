import { prisma } from "../src/lib/prisma";

async function main() {
  const total = await prisma.notification.count();
  const byCategory = await prisma.notification.groupBy({ by: ["category"], _count: true });
  const recCount = await prisma.notification.count({ where: { category: "RECOMMENDATION" } });
  const userCount = await prisma.user.count();
  const sample = await prisma.notification.findFirst({ where: { category: "RECOMMENDATION" }, orderBy: { createdAt: "desc" } });
  console.log(JSON.stringify({ total, byCategory, recCount, userCount, sample }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

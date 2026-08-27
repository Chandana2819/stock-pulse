import { prisma } from "./lib/prisma";

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    // Only allow "admin" (chandanaprakash02@gmail.com) to be the SUPER_ADMIN.
    if (u.username === "admin" || u.email?.toLowerCase() === "chandanaprakash02@gmail.com") {
      await prisma.user.update({
        where: { id: u.id },
        data: { role: "SUPER_ADMIN" }
      });
      console.log(`Verified administrator: ${u.username} (${u.email}) is SUPER_ADMIN`);
    } else if (u.role !== "USER") {
      // Revert all other administrative accounts back to standard USER status
      await prisma.user.update({
        where: { id: u.id },
        data: { role: "USER" }
      });
      console.log(`Reverted account to standard user: ${u.username} (${u.email})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

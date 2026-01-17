import bcrypt from "bcryptjs";
import { PrismaClient, Role, UserStatus, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ensure order sequence exists
  await prisma.orderSequence.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, current: 0 }
  });

  // default branding setting (logo path placeholder)
  await prisma.setting.upsert({
    where: { key: "brand_name" },
    update: {},
    create: { key: "brand_name", value: "Sticks Work Center" }
  });

  // users (locked spec)
  const users = [
    { name: "Jordan S", username: "jordan.admin", role: Role.ADMIN, password: "739204" },
    { name: "Kaden S", username: "kaden.standard", role: Role.STANDARD, password: "418672" },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role, status: UserStatus.ACTIVE },
      create: { name: u.name, username: u.username, passwordHash: hash, role: u.role, status: UserStatus.ACTIVE }
    });
  }

  console.log("Seed complete.");
  console.log("Login credentials:");
  console.log("- jordan.admin / 739204 (ADMIN)");
  console.log("- kaden.standard / 418672 (STANDARD)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

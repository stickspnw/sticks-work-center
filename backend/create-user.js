import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("739204", 10);
  await prisma.user.create({
    data: {
      name: "Jordan S",
      username: "jordan.admin",
      passwordHash: hash,
      role: "ADMIN",
      status: "ACTIVE"
    }
  });
  console.log("User created: jordan.admin / 739204");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

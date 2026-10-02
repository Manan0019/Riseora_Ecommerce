import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seeding");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; admin seed skipped.");
    return;
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let seedReferralCode = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `RISE-${randomBytes(5).toString("hex").toUpperCase()}`;
    const exists = await prisma.user.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!exists) { seedReferralCode = candidate; break; }
  }
  if (!seedReferralCode) throw new Error("Could not generate a unique admin referral code");

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      firstName: "Riseora",
      lastName: "Admin",
      email,
      passwordHash,
      role: "ADMIN",
      isActive: true,
      referralCode: seedReferralCode,
    },
    select: { id: true, email: true, role: true },
  });

  console.log("Admin ready:", admin.email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

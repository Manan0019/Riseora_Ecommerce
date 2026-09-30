import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { signAuthToken } from "../utils/jwt";

const router = Router();
router.use(requireAuth);

const profileSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
});

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });
    res.json({ success: true, data: user });
  }),
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid profile details", errors: parsed.error.flatten() });

    if (parsed.data.phone) {
      const existing = await prisma.user.findFirst({ where: { phone: parsed.data.phone, id: { not: req.user!.id } }, select: { id: true } });
      if (existing) return res.status(409).json({ success: false, message: "Phone number is already used by another account" });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        phone: parsed.data.phone || null,
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
    });
    res.json({ success: true, data: user });
  }),
);


router.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      currentPassword: z.string().min(1).max(100),
      newPassword: z.string().min(8).max(100),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Enter your current password and a new password of at least 8 characters" });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: "Choose a new password different from your current password" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, tokenVersion: true },
    });
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    const token = signAuthToken({ sub: updated.id, email: updated.email, role: updated.role, ver: updated.tokenVersion });
    res.json({ success: true, data: { token }, message: "Password changed successfully." });
  }),
);

const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(20),
  line1: z.string().trim().min(3).max(180),
  line2: z.string().trim().max(180).optional().or(z.literal("")),
  landmark: z.string().trim().max(180).optional().or(z.literal("")),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(4).max(12),
  country: z.string().trim().min(2).max(80).default("India"),
  type: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
  isDefault: z.boolean().default(false),
});

router.get(
  "/addresses",
  asyncHandler(async (req, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: addresses });
  }),
);

router.post(
  "/addresses",
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid address", errors: parsed.error.flatten() });

    const count = await prisma.address.count({ where: { userId: req.user!.id } });
    const makeDefault = parsed.data.isDefault || count === 0;

    const address = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId: req.user!.id,
          name: parsed.data.name,
          phone: parsed.data.phone,
          line1: parsed.data.line1,
          line2: parsed.data.line2 || null,
          landmark: parsed.data.landmark || null,
          city: parsed.data.city,
          state: parsed.data.state,
          postalCode: parsed.data.postalCode,
          country: parsed.data.country,
          type: parsed.data.type,
          isDefault: makeDefault,
        },
      });
    });

    res.status(201).json({ success: true, data: address });
  }),
);

router.patch(
  "/addresses/:id",
  asyncHandler(async (req, res) => {
    const parsed = addressSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid address update", errors: parsed.error.flatten() });

    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    const address = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
      return tx.address.update({
        where: { id: existing.id },
        data: {
          ...parsed.data,
          line2: parsed.data.line2 === "" ? null : parsed.data.line2,
          landmark: parsed.data.landmark === "" ? null : parsed.data.landmark,
        },
      });
    });

    res.json({ success: true, data: address });
  }),
);

router.delete(
  "/addresses/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Address not found" });

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });

    res.json({ success: true });
  }),
);

export default router;

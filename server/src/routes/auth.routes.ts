import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { signAuthToken } from "../utils/jwt";

const router = Router();

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
  password: z.string().min(8).max(100),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration details",
        errors: parsed.error.flatten(),
      });
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(parsed.data.phone ? [{ phone: parsed.data.phone }] : []),
        ],
      },
    });

    if (existing) {
      return res.status(409).json({ success: false, message: "Email or phone already registered" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email,
        phone: parsed.data.phone || null,
        passwordHash,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
      },
    });

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    res.status(201).json({ success: true, data: { token, user } });
  }),
);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });

    if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const token = signAuthToken({ sub: user.id, email: user.email, role: user.role });
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      },
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      return res.status(401).json({ success: false, message: "Account unavailable" });
    }

    res.json({ success: true, data: user });
  }),
);

export default router;

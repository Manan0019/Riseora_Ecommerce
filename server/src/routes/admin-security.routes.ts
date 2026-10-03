import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { createAuthSession, recordSecurityEvent, revokeAllAuthSessions } from "../services/auth-security.service";
import { permissionsForAdminRole } from "../security/admin-permissions";

const router = Router();
router.use(requireAuth, requireAdmin);

const adminRoleSchema = z.enum(["OWNER", "OPERATIONS", "CATALOG", "MARKETING", "SUPPORT"]);

async function activeOwnerCount() {
  return prisma.user.count({ where: { role: "ADMIN", isActive: true, OR: [{ adminRole: "OWNER" }, { adminRole: null }] } });
}

router.get("/security/overview", asyncHandler(async (req, res) => {
  const [admins, recentChanges, failedChanges, recent, activeSessions, lockedAccounts, failedLogins24h, recentAuthEvents] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, firstName: true, lastName: true, email: true, adminRole: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, statusCode: { gte: 400 } } }),
    prisma.adminAuditLog.findMany({
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true, adminRole: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.user.count({ where: { isActive: true, lockedUntil: { gt: new Date() } } }),
    prisma.authSecurityEvent.count({ where: { type: { in: ["LOGIN_FAILED", "LOGIN_BLOCKED"] }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.authSecurityEvent.findMany({
      where: { type: { in: ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_BLOCKED", "PASSWORD_CHANGED", "PASSWORD_RESET", "SESSIONS_REVOKED"] } },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  const currentRole = req.user?.adminRole || "OWNER";
  res.json({
    success: true,
    data: {
      currentRole,
      permissions: permissionsForAdminRole(currentRole),
      activeAdmins: admins.filter((item: any) => item.isActive).length,
      inactiveAdmins: admins.filter((item: any) => !item.isActive).length,
      ownerCount: admins.filter((item: any) => item.isActive && (!item.adminRole || item.adminRole === "OWNER")).length,
      recentChanges,
      failedChanges,
      activeSessions,
      lockedAccounts,
      failedLogins24h,
      admins,
      recent,
      recentAuthEvents,
    },
  });
}));

router.get("/security/audit", asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(20, Number(req.query.limit || 80)));
  const method = typeof req.query.method === "string" ? req.query.method.toUpperCase() : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const failedOnly = String(req.query.failedOnly || "") === "true";
  const rows = await prisma.adminAuditLog.findMany({
    where: {
      ...(method && ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { method } : {}),
      ...(failedOnly ? { statusCode: { gte: 400 } } : {}),
      ...(search ? { OR: [{ path: { contains: search, mode: "insensitive" } }, { action: { contains: search, mode: "insensitive" } }, { actor: { is: { email: { contains: search, mode: "insensitive" } } } }] } : {}),
    },
    include: { actor: { select: { id: true, firstName: true, lastName: true, email: true, adminRole: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ success: true, data: rows });
}));

router.get("/security/staff", asyncHandler(async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, adminRole: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  res.json({ success: true, data: admins });
}));

router.post("/security/staff/promote", asyncHandler(async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email(), adminRole: adminRoleSchema.default("SUPPORT") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid account email and admin role." });
  const target = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true, role: true, isActive: true } });
  if (!target) return res.status(404).json({ success: false, message: "No Riseora account exists with that email. Ask the staff member to create an account first." });
  if (!target.isActive) return res.status(409).json({ success: false, message: "That account is inactive. Reactivate it before granting admin access." });
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: "ADMIN", adminRole: parsed.data.adminRole, tokenVersion: { increment: 1 } },
    select: { id: true, firstName: true, lastName: true, email: true, adminRole: true, isActive: true },
  });
  await revokeAllAuthSessions(target.id, "ADMIN_ACCESS_CHANGED");
  res.status(201).json({ success: true, data: updated, message: "Admin access granted. Existing sessions for that account were invalidated." });
}));

router.patch("/security/staff/:id", asyncHandler(async (req, res) => {
  const parsed = z.object({ adminRole: adminRoleSchema.optional(), isActive: z.boolean().optional(), removeAdmin: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ success: false, message: "No valid staff change supplied." });
  const id = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, adminRole: true, isActive: true } });
  if (!target || target.role !== "ADMIN") return res.status(404).json({ success: false, message: "Admin account not found." });
  if (id === req.user!.id && (parsed.data.isActive === false || parsed.data.removeAdmin)) return res.status(400).json({ success: false, message: "You cannot deactivate or remove your own admin access." });

  const targetIsOwner = !target.adminRole || target.adminRole === "OWNER";
  const losingOwner = targetIsOwner && (parsed.data.removeAdmin || parsed.data.isActive === false || (parsed.data.adminRole && parsed.data.adminRole !== "OWNER"));
  if (losingOwner && await activeOwnerCount() <= 1) return res.status(409).json({ success: false, message: "Riseora must always have at least one active Owner admin." });

  const data: any = { tokenVersion: { increment: 1 } };
  if (parsed.data.removeAdmin) { data.role = "CUSTOMER"; data.adminRole = null; }
  else if (parsed.data.adminRole) data.adminRole = parsed.data.adminRole;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  const updated = await prisma.user.update({
    where: { id }, data,
    select: { id: true, firstName: true, lastName: true, email: true, role: true, adminRole: true, isActive: true },
  });
  await revokeAllAuthSessions(id, "ADMIN_ACCESS_CHANGED");
  res.json({ success: true, data: updated, message: "Staff access updated and previous sessions invalidated." });
}));

router.post("/security/session/rotate", asyncHandler(async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true, email: true, role: true, adminRole: true, tokenVersion: true },
  });
  await revokeAllAuthSessions(updated.id, "ADMIN_SESSION_ROTATE");
  const { session, token } = await createAuthSession(updated, req);
  await recordSecurityEvent({ req, type: "SESSIONS_REVOKED", userId: updated.id, sessionId: session.id, identity: updated.email });
  res.json({ success: true, data: { token, adminRole: updated.adminRole }, message: "Other sessions were signed out. This browser remains signed in." });
}));

export default router;

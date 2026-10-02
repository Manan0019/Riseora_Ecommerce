import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyAuthToken } from "../utils/jwt";

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

async function resolveAuthenticatedUser(token: string) {
  const payload = verifyAuthToken(token);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true, adminRole: true, isActive: true, tokenVersion: true },
  });
  if (!user?.isActive) return null;
  const tokenVersion = Number.isInteger(payload.ver) ? payload.ver : 0;
  if (user.tokenVersion !== tokenVersion) return null;
  return { id: user.id, email: user.email, role: user.role, adminRole: user.adminRole };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) return next();

  try {
    const user = await resolveAuthenticatedUser(token);
    if (user) req.user = user;
  } catch {
    // Optional authentication deliberately ignores invalid/expired tokens.
  }

  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const user = await resolveAuthenticatedUser(token);
    if (!user) return res.status(401).json({ success: false, message: "Session expired. Please sign in again." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

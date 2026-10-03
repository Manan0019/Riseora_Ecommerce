import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verifyAuthToken } from "../utils/jwt";
import { touchAuthSession } from "../services/auth-security.service";

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

  if (payload.sid) {
    const session = await prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, tokenVersion: true, expiresAt: true, revokedAt: true },
    });
    if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date() || session.tokenVersion !== tokenVersion) return null;
  }

  return {
    user: { id: user.id, email: user.email, role: user.role, adminRole: user.adminRole },
    sessionId: payload.sid || null,
  };
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) return next();

  try {
    const resolved = await resolveAuthenticatedUser(token);
    if (resolved) {
      req.user = resolved.user;
      if (resolved.sessionId) {
        req.authSessionId = resolved.sessionId;
        void touchAuthSession(resolved.sessionId).catch(() => {});
      }
    }
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
    const resolved = await resolveAuthenticatedUser(token);
    if (!resolved) return res.status(401).json({ success: false, message: "Session expired. Please sign in again." });
    req.user = resolved.user;
    if (resolved.sessionId) {
      req.authSessionId = resolved.sessionId;
      void touchAuthSession(resolved.sessionId).catch(() => {});
    }
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

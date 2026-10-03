import { createHmac } from "node:crypto";
import type { Request } from "express";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { signAuthToken } from "../utils/jwt";
import { Prisma } from "../generated/prisma/client";

type AuthUserShape = {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
  tokenVersion: number;
};

function trimAgent(value: unknown) {
  return typeof value === "string" ? value.slice(0, 500) : null;
}

function rawRequestIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0];
  return req.ip || req.socket.remoteAddress || "unknown";
}

function privacyHash(value: string) {
  return createHmac("sha256", env.JWT_SECRET).update(value.trim().toLowerCase()).digest("hex");
}

export function securityIdentityHash(identity: string) {
  return privacyHash(`identity:${identity}`);
}

export function requestSecurityContext(req: Request) {
  const userAgent = trimAgent(req.headers["user-agent"]);
  const ipHash = privacyHash(`ip:${rawRequestIp(req)}`);
  return {
    userAgent,
    ipHash,
    deviceLabel: describeDevice(userAgent || ""),
  };
}

export function describeDevice(userAgent: string) {
  const ua = userAgent || "";
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /Firefox\//i.test(ua) ? "Firefox"
      : /Chrome\//i.test(ua) ? "Chrome"
        : /Safari\//i.test(ua) ? "Safari"
          : "Browser";
  const platform = /Windows/i.test(ua) ? "Windows"
    : /Android/i.test(ua) ? "Android"
      : /iPhone|iPad|iPod/i.test(ua) ? "iPhone / iPad"
        : /Macintosh|Mac OS/i.test(ua) ? "macOS"
          : /Linux/i.test(ua) ? "Linux"
            : "device";
  return `${browser} on ${platform}`;
}

export async function recordSecurityEvent(input: {
  req: Request;
  type: "ACCOUNT_CREATED" | "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGIN_BLOCKED" | "LOGOUT" | "PASSWORD_CHANGED" | "PASSWORD_RESET" | "SESSION_REVOKED" | "SESSIONS_REVOKED" | "DATA_EXPORT";
  userId?: string | null;
  sessionId?: string | null;
  identity?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  const context = requestSecurityContext(input.req);
  return prisma.authSecurityEvent.create({
    data: {
      userId: input.userId || null,
      type: input.type,
      sessionId: input.sessionId || null,
      identityHash: input.identity ? securityIdentityHash(input.identity) : null,
      deviceLabel: context.deviceLabel,
      userAgent: context.userAgent,
      ipHash: context.ipHash,
      metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata ?? undefined),
    },
  });
}

export async function createAuthSession(user: AuthUserShape, req: Request) {
  const context = requestSecurityContext(req);
  const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenVersion: user.tokenVersion,
      deviceLabel: context.deviceLabel,
      userAgent: context.userAgent,
      ipHash: context.ipHash,
      expiresAt,
    },
  });
  const token = signAuthToken({ sub: user.id, email: user.email, role: user.role, ver: user.tokenVersion, sid: session.id });
  return { session, token };
}

export async function touchAuthSession(sessionId: string) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null, lastSeenAt: { lt: cutoff } },
    data: { lastSeenAt: new Date() },
  });
}

export async function revokeAuthSession(sessionId: string, userId: string, reason: string) {
  return prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllAuthSessions(userId: string, reason: string, exceptSessionId?: string | null) {
  return prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function cleanupExpiredAuthSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.authSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { revokedAt: { lt: cutoff } },
      ],
    },
  });
}

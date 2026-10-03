import os from "node:os";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/prisma";

export const SYSTEM_JOB_KEYS = [
  "CHECKOUT_CLEANUP",
  "CART_RECOVERY",
  "PRICE_ALERTS",
  "REFILL_REMINDERS",
  "AUTH_SESSION_CLEANUP",
] as const;

export type SystemJobKey = (typeof SYSTEM_JOB_KEYS)[number];
const OWNER = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

function safeSummary(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  try { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
  catch { return { result: String(value) }; }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500);
}

export async function runSystemJob<T>(key: SystemJobKey, handler: () => Promise<T>, leaseMs = 15 * 60 * 1000) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  await prisma.systemJobState.upsert({ where: { key }, create: { key }, update: {} });
  const claim = await prisma.systemJobState.updateMany({
    where: { key, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseOwner: OWNER, leaseUntil, lastStartedAt: now },
  });
  if (claim.count !== 1) return { ran: false as const, reason: "already-running" as const };

  const started = Date.now();
  try {
    const result = await handler();
    const summary = safeSummary(result);
    await prisma.systemJobState.updateMany({
      where: { key, leaseOwner: OWNER },
      data: {
        lastSucceededAt: new Date(),
        lastDurationMs: Date.now() - started,
        ...(summary === undefined ? {} : { lastSummary: summary }),
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
      },
    });
    return { ran: true as const, result };
  } catch (error) {
    await prisma.systemJobState.updateMany({
      where: { key, leaseOwner: OWNER },
      data: {
        lastFailedAt: new Date(),
        lastDurationMs: Date.now() - started,
        lastError: errorMessage(error),
        leaseOwner: null,
        leaseUntil: null,
      },
    }).catch(() => undefined);
    throw error;
  }
}

export async function releaseOwnedSystemJobLeases() {
  await prisma.systemJobState.updateMany({
    where: { leaseOwner: OWNER },
    data: { leaseOwner: null, leaseUntil: null },
  });
}

export async function systemJobsSnapshot() {
  const rows = await prisma.systemJobState.findMany({ orderBy: { key: "asc" } });
  return {
    instance: OWNER,
    jobs: SYSTEM_JOB_KEYS.map((key) => {
      const row = rows.find((item) => item.key === key);
      const now = new Date();
      const leaseActive = Boolean(row?.leaseUntil && row.leaseUntil > now);
      const runningHere = Boolean(leaseActive && row?.leaseOwner === OWNER);
      const failedAfterSuccess = Boolean(row?.lastFailedAt && (!row.lastSucceededAt || row.lastFailedAt > row.lastSucceededAt));
      const delayed = Boolean(row?.lastSucceededAt && now.getTime() - row.lastSucceededAt.getTime() > 24 * 60 * 60 * 1000);
      const state = runningHere ? "running" : leaseActive ? "lease-held" : failedAfterSuccess ? "failed" : delayed ? "delayed" : row?.lastSucceededAt ? "healthy" : "idle";
      return {
        key,
        lastStartedAt: row?.lastStartedAt || null,
        lastSucceededAt: row?.lastSucceededAt || null,
        lastFailedAt: row?.lastFailedAt || null,
        lastDurationMs: row?.lastDurationMs || null,
        lastSummary: row?.lastSummary || null,
        lastError: row?.lastError || null,
        running: leaseActive,
        state,
        leaseUntil: row?.leaseUntil || null,
      };
    }),
  };
}

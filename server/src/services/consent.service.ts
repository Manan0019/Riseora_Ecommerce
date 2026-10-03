import type { Request } from "express";
import { prisma } from "../config/prisma";
import { requestSecurityContext } from "./auth-security.service";

export const DEFAULT_PRIVACY_POLICY_VERSION = "2026-10";

export type MarketingPreferenceInput = {
  emailMarketing: boolean;
  smsMarketing: boolean;
  whatsappMarketing: boolean;
};

export async function currentPrivacyPolicyVersion() {
  const settings = await prisma.storeSetting.findUnique({ where: { id: "primary" }, select: { privacyPolicyVersion: true } });
  return settings?.privacyPolicyVersion || DEFAULT_PRIVACY_POLICY_VERSION;
}

export async function recordConsentEvent(input: {
  req: Request;
  userId?: string | null;
  email?: string | null;
  purpose: "ANALYTICS" | "NEWSLETTER" | "EMAIL_MARKETING" | "SMS_MARKETING" | "WHATSAPP_MARKETING";
  decision: "GRANTED" | "WITHDRAWN";
  source: string;
  policyVersion?: string | null;
}) {
  const context = requestSecurityContext(input.req);
  const policyVersion = input.policyVersion || await currentPrivacyPolicyVersion();
  return prisma.consentEvent.create({
    data: {
      userId: input.userId || null,
      email: input.email?.trim().toLowerCase() || null,
      purpose: input.purpose,
      decision: input.decision,
      source: input.source.slice(0, 120),
      policyVersion,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
    },
  });
}

export async function marketingPreferencesForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return null;
  const existing = await prisma.marketingPreference.findUnique({ where: { userId } });
  if (existing) return existing;

  const newsletter = await prisma.newsletterSubscriber.findUnique({ where: { email: user.email.toLowerCase() }, select: { isActive: true } });
  return prisma.marketingPreference.create({
    data: {
      userId,
      emailMarketing: Boolean(newsletter?.isActive),
      lastSource: newsletter?.isActive ? "newsletter-sync" : "account-default",
    },
  });
}

export async function updateMarketingPreferences(input: {
  req: Request;
  userId: string;
  values: MarketingPreferenceInput;
  source: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, firstName: true, phone: true } });
  if (!user) throw new Error("ACCOUNT_NOT_FOUND");
  if ((input.values.smsMarketing || input.values.whatsappMarketing) && !user.phone) throw new Error("PHONE_REQUIRED_FOR_MESSAGING");
  const current = await marketingPreferencesForUser(user.id);
  if (!current) throw new Error("ACCOUNT_NOT_FOUND");
  const policyVersion = await currentPrivacyPolicyVersion();

  const changes = [
    ["emailMarketing", "EMAIL_MARKETING"],
    ["smsMarketing", "SMS_MARKETING"],
    ["whatsappMarketing", "WHATSAPP_MARKETING"],
  ] as const;

  const updated = await prisma.$transaction(async (tx) => {
    const preference = await tx.marketingPreference.update({
      where: { userId: user.id },
      data: { ...input.values, lastSource: input.source },
    });

    if (input.values.emailMarketing) {
      await tx.newsletterSubscriber.upsert({
        where: { email: user.email.toLowerCase() },
        create: {
          email: user.email.toLowerCase(),
          name: user.firstName || null,
          source: "account-privacy-center",
          consentSource: input.source,
          consentVersion: policyVersion,
          isActive: true,
        },
        update: {
          name: user.firstName || undefined,
          source: "account-privacy-center",
          consentSource: input.source,
          consentVersion: policyVersion,
          isActive: true,
          unsubscribedAt: null,
          subscribedAt: new Date(),
        },
      });
    } else {
      await tx.newsletterSubscriber.updateMany({
        where: { email: user.email.toLowerCase(), isActive: true },
        data: { isActive: false, unsubscribedAt: new Date() },
      });
    }
    return preference;
  });

  for (const [field, purpose] of changes) {
    if (Boolean(current[field]) === Boolean(input.values[field])) continue;
    await recordConsentEvent({
      req: input.req,
      userId: user.id,
      email: user.email,
      purpose,
      decision: input.values[field] ? "GRANTED" : "WITHDRAWN",
      source: input.source,
      policyVersion,
    });
    if (field === "emailMarketing") {
      await recordConsentEvent({
        req: input.req,
        userId: user.id,
        email: user.email,
        purpose: "NEWSLETTER",
        decision: input.values.emailMarketing ? "GRANTED" : "WITHDRAWN",
        source: input.source,
        policyVersion,
      });
    }
  }

  return updated;
}

export async function withdrawAllMarketing(input: { req: Request; userId: string; source: string }) {
  const current = await marketingPreferencesForUser(input.userId);
  if (!current) throw new Error("ACCOUNT_NOT_FOUND");
  return updateMarketingPreferences({
    req: input.req,
    userId: input.userId,
    source: input.source,
    values: { emailMarketing: false, smsMarketing: false, whatsappMarketing: false },
  });
}

export async function activeEmailMarketingSubscriber(email: string) {
  const normalized = email.trim().toLowerCase();
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { email: normalized }, select: { isActive: true } });
  return Boolean(subscriber?.isActive);
}

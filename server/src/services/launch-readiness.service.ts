import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { getStoreSettings } from "./store.service";
import { evaluateMaintenance } from "./maintenance.service";
import { adminSystemHealth } from "./system-health.service";

type Check = { key: string; label: string; status: "PASS" | "WARN" | "BLOCK"; detail: string };

export async function launchReadinessSnapshot() {
  const [settings, health, activeProducts, activeVariants, missingImages, missingHsn, missingWeight, zones, partners] = await Promise.all([
    getStoreSettings(),
    adminSystemHealth(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.productVariant.count({ where: { isActive: true, product: { isActive: true } } }),
    prisma.product.count({ where: { isActive: true, images: { none: {} } } }),
    prisma.productVariant.count({ where: { isActive: true, product: { isActive: true }, OR: [{ hsnCode: null }, { hsnCode: "" }] } }),
    prisma.productVariant.count({ where: { isActive: true, product: { isActive: true }, weightGrams: null } }),
    prisma.shippingZone.count({ where: { isActive: true } }),
    prisma.shippingPartner.count({ where: { isActive: true } }),
  ]);

  const maintenance = evaluateMaintenance(settings);
  const checks: Check[] = [];
  const add = (key: string, label: string, status: Check["status"], detail: string) => checks.push({ key, label, status, detail });

  add("database", "Database readiness", health.database?.ok ? "PASS" : "BLOCK", health.database?.ok ? `Connected in ${health.database.latencyMs} ms` : "Database is unavailable");
  add("storage", "Writable production storage", health.storage?.uploadsWritable && health.storage?.backupsWritable ? "PASS" : "BLOCK", health.storage?.uploadsWritable && health.storage?.backupsWritable ? "Uploads and backup directories are writable" : "Uploads or backup storage is not writable");
  const latestBackupAt = health.backup?.latest?.createdAt ? new Date(health.backup.latest.createdAt).getTime() : 0;
  const backupAgeHours = latestBackupAt ? (Date.now() - latestBackupAt) / 3600000 : null;
  const backupStatus: Check["status"] = !health.backup?.latest?.verified ? "BLOCK" : backupAgeHours != null && backupAgeHours > 24 ? "WARN" : "PASS";
  add("backup", "Verified database backup", backupStatus, health.backup?.latest?.verified ? `${health.backup.latest.name} · ${backupAgeHours == null ? "verified" : `${backupAgeHours.toFixed(1)}h old`}` : "Create and verify a database backup before launch");
  add("products", "Sellable catalog", activeProducts > 0 && activeVariants > 0 ? "PASS" : "BLOCK", `${activeProducts} active products · ${activeVariants} active variants`);
  add("images", "Product imagery", missingImages === 0 ? "PASS" : "WARN", missingImages === 0 ? "Every active product has at least one image" : `${missingImages} active products have no image`);
  add("hsn", "HSN coverage", missingHsn === 0 ? "PASS" : "WARN", missingHsn === 0 ? "Every active variant has HSN/SAC" : `${missingHsn} active variants are missing HSN/SAC`);
  add("weights", "Shipping weights", missingWeight === 0 ? "PASS" : "WARN", missingWeight === 0 ? "Every active variant has parcel weight" : `${missingWeight} active variants have no weight`);
  const shippingStatus: Check["status"] = settings.requireServiceablePostalCode && zones === 0 ? "BLOCK" : zones === 0 || partners === 0 ? "WARN" : "PASS";
  add("shipping", "Delivery configuration", shippingStatus, `${zones} active delivery zones · ${partners} active couriers${zones === 0 && !settings.requireServiceablePostalCode ? " · using global fallback rules" : ""}`);
  add("payments", "Checkout payment path", Boolean(settings.codEnabled || (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)) ? "PASS" : "BLOCK", settings.codEnabled ? "COD is enabled" : health.integrations?.razorpay ? "Razorpay is configured" : "No usable payment method is configured");
  add("email", "Transactional email", health.integrations?.email ? "PASS" : "WARN", health.integrations?.email ? "Transactional email is configured" : "Transactional email is not configured");
  const publicUrl = settings.siteUrl || "";
  const publicUrlReady = /^https:\/\//i.test(publicUrl) && !/localhost|127\.0\.0\.1/i.test(publicUrl);
  add("site-url", "Public site URL", publicUrlReady ? "PASS" : "BLOCK", publicUrlReady ? publicUrl : "Set the final HTTPS production site URL (not localhost)");
  add("identity", "Business identity", settings.legalName && settings.supportEmail ? "PASS" : "WARN", settings.legalName && settings.supportEmail ? `${settings.legalName} · ${settings.supportEmail}` : "Add legal name and support email");
  add("tax", "GST identity", settings.gstin && settings.pan ? "PASS" : "WARN", settings.gstin && settings.pan ? `GSTIN ${settings.gstin} · PAN ${settings.pan}` : "Confirm GSTIN and PAN before issuing production tax documents");
  add("policies", "Customer policies", settings.privacyPolicy && settings.termsPolicy && settings.shippingPolicy && settings.returnPolicy ? "PASS" : "BLOCK", settings.privacyPolicy && settings.termsPolicy && settings.shippingPolicy && settings.returnPolicy ? "Privacy, terms, shipping and returns policies are present" : "Complete privacy, terms, shipping and returns policies");
  add("maintenance", "Storefront availability", maintenance.active ? "BLOCK" : maintenance.configured ? "WARN" : "PASS", maintenance.active ? "Maintenance mode is currently active" : maintenance.configured ? "Maintenance mode is configured but not currently active" : "Storefront maintenance mode is off");

  const blocks = checks.filter((item) => item.status === "BLOCK").length;
  const warnings = checks.filter((item) => item.status === "WARN").length;
  const passed = checks.filter((item) => item.status === "PASS").length;
  const score = Math.max(0, Math.round(((passed + warnings * 0.5) / checks.length) * 100));

  return {
    ready: blocks === 0,
    score,
    blocks,
    warnings,
    passed,
    checks,
    catalog: { activeProducts, activeVariants, missingImages, missingHsn, missingWeight },
    delivery: { activeZones: zones, activeCouriers: partners },
    maintenance,
    generatedAt: new Date().toISOString(),
  };
}

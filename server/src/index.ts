import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { allowedOrigins, env } from "./config/env";
import { prisma } from "./config/prisma";
import adminRoutes from "./routes/admin.routes";
import accountRoutes from "./routes/account.routes";
import accountSecurityRoutes from "./routes/account-security.routes";
import authRoutes from "./routes/auth.routes";
import categoryRoutes from "./routes/category.routes";
import orderRoutes from "./routes/order.routes";
import productRoutes from "./routes/product.routes";
import promotionRoutes from "./routes/promotion.routes";
import { publicCampaignRoutes, adminCampaignRoutes } from "./routes/campaign.routes";
import uploadRoutes from "./routes/upload.routes";
import paymentRoutes, { razorpayWebhook } from "./routes/payment.routes";
import storeRoutes from "./routes/store.routes";
import returnRoutes from "./routes/return.routes";
import invoiceRoutes from "./routes/invoice.routes";
import adminOpsRoutes from "./routes/admin-ops.routes";
import adminPaymentRoutes from "./routes/admin-payment.routes";
import adminFinanceRoutes from "./routes/admin-finance.routes";
import engagementRoutes from "./routes/engagement.routes";
import audienceRoutes from "./routes/audience.routes";
import seoRoutes from "./routes/seo.routes";
import wishlistRoutes from "./routes/wishlist.routes";
import notificationRoutes from "./routes/notification.routes";
import retentionRoutes from "./routes/retention.routes";
import lifecycleRoutes from "./routes/lifecycle.routes";
import growthRoutes from "./routes/growth.routes";
import rewardRoutes from "./routes/reward.routes";
import adminRewardsRoutes from "./routes/admin-rewards.routes";
import supportRoutes from "./routes/support.routes";
import refillRoutes from "./routes/refill.routes";
import adminRefillRoutes from "./routes/admin-refill.routes";
import adminSupportRoutes from "./routes/admin-support.routes";
import adminSystemRoutes, { publicSystemRoutes } from "./routes/system.routes";
import erpSyncRoutes from "./routes/erp-sync.routes";
import adminErpRoutes from "./routes/admin-erp.routes";
import adminSecurityRoutes from "./routes/admin-security.routes";
import privacyRoutes from "./routes/privacy.routes";
import adminComplianceRoutes from "./routes/admin-compliance.routes";
import { publicDealRoutes, adminDealRoutes } from "./routes/deal.routes";
import { errorHandler, notFound } from "./middleware/error-handler";
import { requestObservability } from "./middleware/request-observability";
import { requireAdmin, requireAuth } from "./middleware/auth";
import { adminAuditTrail, enforceAdminPermission } from "./middleware/admin-security";
import { runBackgroundJob, runLifecycleJobs } from "./services/background-jobs.service";
import { assertDatabaseSchemaReady } from "./services/database-readiness.service";
import { assertProductionConfigurationReady } from "./services/production-readiness.service";
import { logRuntimeEvent, setRuntimeDraining } from "./services/runtime-observability.service";
import { cleanupExpiredAuthSessions } from "./services/auth-security.service";
import { releaseOwnedSystemJobLeases } from "./services/system-job.service";

const app = express();
if (env.TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

const origins = new Set(allowedOrigins());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  credentials: false,
}));

app.use(requestObservability);
app.post("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: env.NODE_ENV === "production" ? "7d" : 0, immutable: env.NODE_ENV === "production" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: "draft-8", legacyHeaders: false }));

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: "draft-8", legacyHeaders: false }), authRoutes);

app.use("/api", publicSystemRoutes);
app.use("/api/integrations/erp", erpSyncRoutes);

app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/campaigns", publicCampaignRoutes);
app.use("/api/promotions", publicDealRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/refills", refillRoutes);
app.use("/api", engagementRoutes);
app.use("/api", privacyRoutes);
app.use("/api/payments", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }), paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/account/security", accountSecurityRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/admin", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }), requireAuth, requireAdmin, adminAuditTrail, enforceAdminPermission);
app.use("/api/admin/uploads", uploadRoutes);
app.use("/api/admin", adminSecurityRoutes);
app.use("/api/admin", adminComplianceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminCampaignRoutes);
app.use("/api/admin", adminDealRoutes);
app.use("/api/admin", adminOpsRoutes);
app.use("/api/admin", adminPaymentRoutes);
app.use("/api/admin", adminFinanceRoutes);
app.use("/api/admin", adminSystemRoutes);
app.use("/api/admin", adminErpRoutes);
app.use("/api/admin", audienceRoutes);
app.use("/api/admin/retention", retentionRoutes);
app.use("/api/admin/lifecycle", lifecycleRoutes);
app.use("/api/admin/growth", growthRoutes);
app.use("/api/admin", adminRewardsRoutes);
app.use("/api/admin", adminSupportRoutes);
app.use("/api/admin", adminRefillRoutes);
app.use("/", seoRoutes);
app.use("/api", notFound);

if (env.SERVE_CLIENT) {
  const clientDist = path.resolve(process.cwd(), "../client/dist");
  app.use(express.static(clientDist, {
    index: false,
    setHeaders(res, filePath) {
      if (env.NODE_ENV !== "production") return;
      const assetsSegment = `${path.sep}assets${path.sep}`;
      if (filePath.includes(assetsSegment)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || !req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(clientDist, "index.html"), (error) => error ? next(error) : undefined);
  });
}

app.use(notFound);
app.use(errorHandler);

let server: ReturnType<typeof app.listen> | null = null;
let checkoutCleanupTimer: NodeJS.Timeout | null = null;
let cartRecoveryTimer: NodeJS.Timeout | null = null;
let authSessionCleanupTimer: NodeJS.Timeout | null = null;

async function startServer() {
  const production = assertProductionConfigurationReady();
  if (env.NODE_ENV === "production" && production.warnings.length) logRuntimeEvent("warn", "production_configuration_warnings", { warnings: production.warnings });
  const schema = await assertDatabaseSchemaReady();
  logRuntimeEvent("info", "database_schema_ready", { migrationHead: schema.expectedMigrationHead, appliedMigrationCount: schema.appliedMigrationCount });

  server = app.listen(env.PORT, () => {
    logRuntimeEvent("info", "server_started", { port: env.PORT, environment: env.NODE_ENV, releaseName: env.RELEASE_NAME || null, releaseSha: env.RELEASE_SHA || null, releaseBuildTime: env.RELEASE_BUILD_TIME || null });
    if (env.NODE_ENV !== "production") console.log(`Riseora API running on http://localhost:${env.PORT}`);
    void runBackgroundJob("CHECKOUT_CLEANUP").catch((error) => console.error("Checkout cleanup failed", error));
    void runLifecycleJobs().catch((error) => console.error("Lifecycle processing failed", error));
    void runBackgroundJob("AUTH_SESSION_CLEANUP").catch((error) => console.error("Auth session cleanup failed", error));
  });

  checkoutCleanupTimer = setInterval(() => {
    void runBackgroundJob("CHECKOUT_CLEANUP").catch((error) => console.error("Checkout cleanup failed", error));
  }, 5 * 60 * 1000);
  checkoutCleanupTimer.unref();

  cartRecoveryTimer = setInterval(() => {
    void runLifecycleJobs().catch((error) => console.error("Lifecycle processing failed", error));
  }, 10 * 60 * 1000);
  cartRecoveryTimer.unref();

  authSessionCleanupTimer = setInterval(() => {
    void runBackgroundJob("AUTH_SESSION_CLEANUP").catch((error) => console.error("Auth session cleanup failed", error));
  }, 24 * 60 * 60 * 1000);
  authSessionCleanupTimer.unref();
}

void startServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logRuntimeEvent("error", "server_start_failed", { error: message });
  console.error("Riseora API could not start safely.");
  if (message.startsWith("DATABASE_SCHEMA_NOT_READY")) console.error("Run: npm run db:backup && npm run db:deploy && npm run db:generate");
  else if (message.startsWith("PRODUCTION_CONFIGURATION_NOT_READY")) console.error("Review server/.env.production and run: npm run release:doctor");
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  setRuntimeDraining(true);
  logRuntimeEvent("warn", "server_shutdown_started", { signal, activeGraceMs: env.SHUTDOWN_GRACE_MS });
  if (checkoutCleanupTimer) clearInterval(checkoutCleanupTimer);
  if (cartRecoveryTimer) clearInterval(cartRecoveryTimer);
  if (authSessionCleanupTimer) clearInterval(authSessionCleanupTimer);

  const forceTimer = setTimeout(() => {
    logRuntimeEvent("error", "server_shutdown_forced", { signal });
    process.exit(exitCode || 1);
  }, env.SHUTDOWN_GRACE_MS);
  forceTimer.unref();

  if (!server) {
    clearTimeout(forceTimer);
    await releaseOwnedSystemJobLeases().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(exitCode);
    return;
  }
  server.close(async () => {
    clearTimeout(forceTimer);
    try { await releaseOwnedSystemJobLeases(); } catch (error) { logRuntimeEvent("error", "job_lease_release_failed", { message: error instanceof Error ? error.message : String(error) }); }
    try { await prisma.$disconnect(); } catch (error) { logRuntimeEvent("error", "database_disconnect_failed", { message: error instanceof Error ? error.message : String(error) }); }
    logRuntimeEvent("info", "server_shutdown_complete", { signal });
    process.exit(exitCode);
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logRuntimeEvent("error", "unhandled_rejection", { message: reason instanceof Error ? reason.message : String(reason) });
});
process.on("uncaughtException", (error) => {
  logRuntimeEvent("error", "uncaught_exception", { message: error.message, stack: env.NODE_ENV === "development" ? error.stack : undefined });
  void shutdown("uncaughtException", 1);
});

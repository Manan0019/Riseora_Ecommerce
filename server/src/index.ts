import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import adminRoutes from "./routes/admin.routes";
import accountRoutes from "./routes/account.routes";
import authRoutes from "./routes/auth.routes";
import categoryRoutes from "./routes/category.routes";
import orderRoutes from "./routes/order.routes";
import productRoutes from "./routes/product.routes";
import promotionRoutes from "./routes/promotion.routes";
import uploadRoutes from "./routes/upload.routes";
import paymentRoutes, { razorpayWebhook } from "./routes/payment.routes";
import storeRoutes from "./routes/store.routes";
import returnRoutes from "./routes/return.routes";
import invoiceRoutes from "./routes/invoice.routes";
import adminOpsRoutes from "./routes/admin-ops.routes";
import { errorHandler, notFound } from "./middleware/error-handler";
import { releaseExpiredCheckoutSessions } from "./services/checkout.service";

const app = express();

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: false,
  }),
);
app.post("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhook);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), { maxAge: env.NODE_ENV === "production" ? "7d" : 0 }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  authRoutes,
);

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "Riseora E-Commerce API is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ success: false, message: "Database connection failed" });
  }
});

app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/payments", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }), paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin/uploads", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", adminOpsRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`Riseora API running on http://localhost:${env.PORT}`);
  void releaseExpiredCheckoutSessions().catch((error) => console.error("Checkout cleanup failed", error));
});

const checkoutCleanupTimer = setInterval(() => {
  void releaseExpiredCheckoutSessions().catch((error) => console.error("Checkout cleanup failed", error));
}, 5 * 60 * 1000);
checkoutCleanupTimer.unref();

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down...`);
  clearInterval(checkoutCleanupTimer);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

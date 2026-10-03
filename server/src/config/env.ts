import "dotenv/config";
import { z } from "zod";

const optionalString = z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().optional());
const optionalEmail = z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().email().optional());
const envBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_SITE_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: optionalString,
  TRUST_PROXY: envBoolean.default(false),
  SERVE_CLIENT: envBoolean.default(false),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  CLOUDINARY_FOLDER: z.string().default("riseora/products"),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  ADMIN_NOTIFICATION_EMAIL: optionalEmail,
  CART_RECOVERY_ENABLED: envBoolean.default(false),
  CART_RECOVERY_FIRST_DELAY_MINUTES: z.coerce.number().int().min(15).max(10080).default(120),
  CART_RECOVERY_SECOND_DELAY_MINUTES: z.coerce.number().int().min(60).max(20160).default(1440),
  BACKUP_DIR: optionalString,
  PG_BIN: optionalString,
  PG_DUMP_PATH: optionalString,
  PG_RESTORE_PATH: optionalString,
  BACKUP_RETENTION_COUNT: z.coerce.number().int().min(1).max(100).default(14),
  SLOW_REQUEST_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  RELEASE_NAME: optionalString,
  RELEASE_SHA: optionalString,
  RELEASE_BUILD_TIME: optionalString,
  ERP_SYNC_ENABLED: envBoolean.default(false),
  ERP_SYNC_API_KEY: optionalString,
  ERP_SYNC_MAX_BATCH: z.coerce.number().int().min(10).max(1000).default(500),
}).superRefine((value, ctx) => {
  if (value.ERP_SYNC_ENABLED && (!value.ERP_SYNC_API_KEY || value.ERP_SYNC_API_KEY.length < 32)) {
    ctx.addIssue({ code: "custom", path: ["ERP_SYNC_API_KEY"], message: "ERP_SYNC_API_KEY must be at least 32 characters when ERP sync is enabled" });
  }

  if (value.NODE_ENV === "production") {
    if (!value.PUBLIC_SITE_URL) {
      ctx.addIssue({ code: "custom", path: ["PUBLIC_SITE_URL"], message: "PUBLIC_SITE_URL is required in production" });
    }

    for (const [key, url] of [["CLIENT_URL", value.CLIENT_URL], ["PUBLIC_SITE_URL", value.PUBLIC_SITE_URL]] as const) {
      if (url && !url.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} must use HTTPS in production` });
      }
    }

    if (value.JWT_SECRET.length < 48 || /replace|example|change[-_ ]?me|your[-_ ]?secret/i.test(value.JWT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "JWT_SECRET must be a real unique production secret of at least 48 characters" });
    }

    if (value.ALLOWED_ORIGINS?.split(",").some((origin) => origin.trim() === "*")) {
      ctx.addIssue({ code: "custom", path: ["ALLOWED_ORIGINS"], message: "Wildcard ALLOWED_ORIGINS is not permitted in production" });
    }

    const razorpayConfigured = [value.RAZORPAY_KEY_ID, value.RAZORPAY_KEY_SECRET, value.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length;
    if (razorpayConfigured > 0 && razorpayConfigured < 3) {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_ID"], message: "Razorpay production configuration must include key ID, key secret and webhook secret together" });
    }

    const cloudinaryConfigured = [value.CLOUDINARY_CLOUD_NAME, value.CLOUDINARY_API_KEY, value.CLOUDINARY_API_SECRET].filter(Boolean).length;
    if (cloudinaryConfigured > 0 && cloudinaryConfigured < 3) {
      ctx.addIssue({ code: "custom", path: ["CLOUDINARY_CLOUD_NAME"], message: "Cloudinary production configuration must be complete when enabled" });
    }

    if (Boolean(value.RESEND_API_KEY) !== Boolean(value.EMAIL_FROM)) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY and EMAIL_FROM must be configured together" });
    }
  }
});

export const env = schema.parse(process.env);

export function allowedOrigins() {
  return [...new Set([
    env.CLIENT_URL,
    env.PUBLIC_SITE_URL,
    ...(env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) || []),
  ].filter(Boolean) as string[])];
}

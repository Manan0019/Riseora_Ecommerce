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
});

export const env = schema.parse(process.env);

export function allowedOrigins() {
  return [...new Set([
    env.CLIENT_URL,
    env.PUBLIC_SITE_URL,
    ...(env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) || []),
  ].filter(Boolean) as string[])];
}

import { env } from "../config/env";

const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

function releaseShaShort() {
  return env.RELEASE_SHA ? env.RELEASE_SHA.slice(0, 12) : null;
}

export function releaseMetadata() {
  return {
    environment: env.NODE_ENV,
    name: env.RELEASE_NAME || null,
    sha: releaseShaShort(),
    buildTime: env.RELEASE_BUILD_TIME || null,
    startedAt,
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function productionConfigurationStatus() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (env.NODE_ENV === "production") {
    if (!env.PUBLIC_SITE_URL) errors.push("PUBLIC_SITE_URL is required");
    if (!env.CLIENT_URL.startsWith("https://")) errors.push("CLIENT_URL must use HTTPS");
    if (env.PUBLIC_SITE_URL && !env.PUBLIC_SITE_URL.startsWith("https://")) errors.push("PUBLIC_SITE_URL must use HTTPS");
    if (env.ALLOWED_ORIGINS?.split(",").some((origin) => origin.trim() === "*")) errors.push("Wildcard ALLOWED_ORIGINS is not allowed");
    if (!env.SERVE_CLIENT) warnings.push("SERVE_CLIENT is disabled; confirm the frontend is deployed separately");
    if (!env.TRUST_PROXY) warnings.push("TRUST_PROXY is disabled; enable it only when a trusted reverse proxy terminates HTTPS");
    if (!env.RELEASE_NAME) warnings.push("RELEASE_NAME is not configured");
    if (!env.RELEASE_SHA) warnings.push("RELEASE_SHA is not configured");
    if (!env.RELEASE_BUILD_TIME) warnings.push("RELEASE_BUILD_TIME is not configured");
  }

  if (!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)) {
    warnings.push("Razorpay is not fully configured");
  }
  if (!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)) {
    warnings.push("Cloudinary is not fully configured");
  }
  if (!(env.RESEND_API_KEY && env.EMAIL_FROM)) {
    warnings.push("Transactional email is not fully configured");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    servingClient: env.SERVE_CLIENT,
    trustProxy: env.TRUST_PROXY,
    configuredOrigins: allowedOriginCount(),
    release: releaseMetadata(),
  };
}

function allowedOriginCount() {
  return new Set([
    env.CLIENT_URL,
    env.PUBLIC_SITE_URL,
    ...(env.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) || []),
  ].filter(Boolean)).size;
}

export function assertProductionConfigurationReady() {
  const status = productionConfigurationStatus();
  if (env.NODE_ENV === "production" && !status.ok) {
    const error = new Error(`PRODUCTION_CONFIGURATION_NOT_READY: ${status.errors.join("; ")}`);
    (error as Error & { code?: string }).code = "PRODUCTION_CONFIGURATION_NOT_READY";
    throw error;
  }
  return status;
}

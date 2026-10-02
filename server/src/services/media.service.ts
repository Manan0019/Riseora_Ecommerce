import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

export const cloudMediaEnabled = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

const extensionByMime: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function isAllowedProductImage(mime: string) {
  return Boolean(extensionByMime[mime]);
}

function cloudFolder(kind: "products" | "brand" | "campaigns" | "categories" | "reviews" | "returns") {
  const configured = (env.CLOUDINARY_FOLDER || "").replace(/\/+$/, "");
  if (!configured) return `riseora/${kind}`;
  if (kind === "products") return configured;
  return `${configured}/${kind}`;
}

async function uploadCloud(buffer: Buffer, mime: string, kind: "products" | "brand" | "campaigns" | "categories" | "reviews" | "returns") {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new Error("CLOUD_MEDIA_NOT_CONFIGURED");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = cloudFolder(kind);
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`)
    .digest("hex");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), `riseora${extensionByMime[mime] || ".img"}`);
  form.append("api_key", env.CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`,
    { method: "POST", body: form },
  );
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || typeof body.secure_url !== "string" || typeof body.public_id !== "string") {
    console.error("Cloudinary upload failed", response.status, body);
    throw new Error("CLOUD_IMAGE_UPLOAD_FAILED");
  }

  return { url: body.secure_url, publicId: body.public_id };
}

async function uploadLocal(buffer: Buffer, mime: string, kind: "products" | "brand" | "campaigns" | "categories" | "reviews" | "returns") {
  const uploadRoot = path.resolve(process.cwd(), "uploads", kind);
  await fs.mkdir(uploadRoot, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${extensionByMime[mime] || ".img"}`;
  await fs.writeFile(path.join(uploadRoot, filename), buffer);
  return { url: `/uploads/${kind}/${filename}`, publicId: filename };
}

async function storeImage(buffer: Buffer, mime: string, kind: "products" | "brand" | "campaigns" | "categories" | "reviews" | "returns") {
  return cloudMediaEnabled ? uploadCloud(buffer, mime, kind) : uploadLocal(buffer, mime, kind);
}

export function storeProductImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "products");
}

export function storeBrandImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "brand");
}

export function storeCampaignImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "campaigns");
}

export function storeCategoryImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "categories");
}

export function storeReviewImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "reviews");
}

export function storeReturnImage(buffer: Buffer, mime: string) {
  return storeImage(buffer, mime, "returns");
}

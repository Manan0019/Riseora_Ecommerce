import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { requireAdmin, requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

const uploadRoot = path.resolve(process.cwd(), "uploads", "products");
fs.mkdirSync(uploadRoot, { recursive: true });

const extensionByMime: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadRoot),
  filename: (_req, file, callback) => {
    const extension = extensionByMime[file.mimetype] || ".img";
    const stamp = Date.now();
    callback(null, `${stamp}-${randomBytes(8).toString("hex")}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) => {
    if (!extensionByMime[file.mimetype]) {
      callback(new Error("Only JPG, PNG and WEBP images are allowed"));
      return;
    }
    callback(null, true);
  },
});

router.post("/products", upload.array("images", 8), (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one image" });

  res.status(201).json({
    success: true,
    data: files.map((file) => ({
      url: `/uploads/products/${file.filename}`,
      originalName: file.originalname,
      size: file.size,
    })),
  });
});

export default router;

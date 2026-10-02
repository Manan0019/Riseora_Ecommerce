import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAdmin, requireAuth } from "../middleware/auth";
import {
  cloudMediaEnabled,
  isAllowedProductImage,
  storeBrandImage,
  storeCampaignImage,
  storeCategoryImage,
  storeProductImage,
  storeReviewImage,
  storeReturnImage,
} from "../services/media.service";

const router = Router();
const reviewUploadLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) =>
    isAllowedProductImage(file.mimetype)
      ? callback(null, true)
      : callback(new Error("Only JPG, PNG and WEBP images are allowed")),
});

router.post("/reviews", reviewUploadLimit, requireAuth, upload.array("images", 4), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one review image" });
    const stored = await Promise.all(
      files.map(async (file) => ({
        ...(await storeReviewImage(file.buffer, file.mimetype)),
        originalName: file.originalname,
        size: file.size,
      })),
    );
    res.status(201).json({ success: true, storage: cloudMediaEnabled ? "cloudinary" : "local", data: stored });
  } catch (error) {
    next(error);
  }
});

router.post("/returns", reviewUploadLimit, requireAuth, upload.array("images", 4), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one return evidence image" });
    const stored = await Promise.all(
      files.map(async (file) => ({
        ...(await storeReturnImage(file.buffer, file.mimetype)),
        originalName: file.originalname,
        size: file.size,
      })),
    );
    res.status(201).json({ success: true, storage: cloudMediaEnabled ? "cloudinary" : "local", data: stored });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth, requireAdmin);

router.post("/products", upload.array("images", 8), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one image" });
    const stored = await Promise.all(
      files.map(async (file) => ({
        ...(await storeProductImage(file.buffer, file.mimetype)),
        originalName: file.originalname,
        size: file.size,
      })),
    );
    res.status(201).json({ success: true, storage: cloudMediaEnabled ? "cloudinary" : "local", data: stored });
  } catch (error) {
    next(error);
  }
});

router.post("/brand", upload.single("image"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Select a logo image" });
    const stored = await storeBrandImage(file.buffer, file.mimetype);
    res.status(201).json({
      success: true,
      storage: cloudMediaEnabled ? "cloudinary" : "local",
      data: { ...stored, originalName: file.originalname, size: file.size },
    });
  } catch (error) {
    next(error);
  }
});


router.post("/categories", upload.single("image"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Select a category image" });
    const stored = await storeCategoryImage(file.buffer, file.mimetype);
    res.status(201).json({
      success: true,
      storage: cloudMediaEnabled ? "cloudinary" : "local",
      data: { ...stored, originalName: file.originalname, size: file.size },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/campaigns", upload.single("image"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Select a campaign image" });
    const stored = await storeCampaignImage(file.buffer, file.mimetype);
    res.status(201).json({
      success: true,
      storage: cloudMediaEnabled ? "cloudinary" : "local",
      data: { ...stored, originalName: file.originalname, size: file.size },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

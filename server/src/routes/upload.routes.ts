import { Router } from "express";
import multer from "multer";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { cloudMediaEnabled, isAllowedProductImage, storeProductImage } from "../services/media.service";

const router = Router();
router.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) => isAllowedProductImage(file.mimetype) ? callback(null, true) : callback(new Error("Only JPG, PNG and WEBP images are allowed")),
});

router.post("/products", upload.array("images", 8), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one image" });
    const stored = await Promise.all(files.map(async (file) => ({ ...(await storeProductImage(file.buffer, file.mimetype)), originalName: file.originalname, size: file.size })));
    res.status(201).json({ success: true, storage: cloudMediaEnabled ? "cloudinary" : "local", data: stored });
  } catch (error) { next(error); }
});

export default router;

import { Router } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    res.json({ success: true, data: categories });
  }),
);

export default router;

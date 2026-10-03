import type { NextFunction, Request, Response } from "express";
import { currentMaintenance } from "../services/maintenance.service";

export async function blockCommerceDuringMaintenance(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const maintenance = await currentMaintenance();
  if (!maintenance.active) return next();
  return res.status(503).json({
    success: false,
    code: "STORE_MAINTENANCE",
    message: maintenance.message || "Riseora is briefly unavailable while we complete scheduled maintenance. Please try again shortly.",
    maintenance: {
      active: true,
      startsAt: maintenance.startsAt,
      endsAt: maintenance.endsAt,
    },
  });
}

import type { NextFunction, Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error(error);

  if (error instanceof Error && error.message.startsWith("OUT_OF_STOCK:")) {
    const sku = error.message.replace("OUT_OF_STOCK:", "");
    return res.status(409).json({
      success: false,
      message: `Insufficient stock for ${sku}`,
    });
  }

  if (error instanceof Error && error.message === "COUPON_LIMIT_REACHED") {
    return res.status(409).json({
      success: false,
      message: "This coupon has reached its usage limit",
    });
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong on the server",
  });
}

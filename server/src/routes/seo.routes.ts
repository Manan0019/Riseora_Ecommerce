import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";

const router = Router();
const base = () => (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
const xml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!));

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nDisallow: /orders\nDisallow: /returns\nSitemap: ${base()}/sitemap.xml\n`);
});

router.get("/sitemap.xml", asyncHandler(async (_req, res) => {
  const [products] = await Promise.all([prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" } })]);
  const staticPaths = ["/", "/shop", "/routine-builder", "/offers", "/about", "/contact", "/track-order", "/policies/shipping", "/policies/returns", "/policies/privacy", "/policies/terms"];
  const urls = [
    ...staticPaths.map((path) => ({ loc: `${base()}${path}`, lastmod: null })),
    ...products.map((product) => ({ loc: `${base()}/product/${encodeURIComponent(product.slug)}`, lastmod: product.updatedAt.toISOString() })),
  ];
  const body = urls.map((item) => `<url><loc>${xml(item.loc)}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ""}</url>`).join("");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
}));

export default router;

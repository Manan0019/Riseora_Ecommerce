import { Router } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/async-handler";
import { getStoreSettings } from "../services/store.service";

const router = Router();
const base = () => (env.PUBLIC_SITE_URL || env.CLIENT_URL).replace(/\/$/, "");
const xml = (value: unknown) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!));
const plain = (value: unknown) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const absolute = (value: string | null | undefined) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${base()}${value.startsWith("/") ? "" : "/"}${value}`;
};

function liveDealWhere(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").set("Cache-Control", "public, max-age=3600").send([
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /checkout",
    "Disallow: /cart",
    "Disallow: /wishlist",
    "Disallow: /notifications",
    "Disallow: /orders",
    "Disallow: /returns",
    "Disallow: /invoice",
    "Disallow: /recover-cart",
    "Disallow: /reset-password",
    "Disallow: /api/",
    `Sitemap: ${base()}/sitemap.xml`,
    "",
  ].join("\n"));
});

router.get("/sitemap.xml", asyncHandler(async (_req, res) => {
  const now = new Date();
  const [products, deals] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }),
    prisma.merchandisingDeal.findMany({ where: liveDealWhere(now), select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const staticPaths = ["/", "/shop", "/routine-builder", "/offers", "/about", "/contact", "/track-order", "/policies/shipping", "/policies/returns", "/policies/privacy", "/policies/terms"];
  const urls = [
    ...staticPaths.map((path) => ({ loc: `${base()}${path === "/" ? "" : path}`, lastmod: null, priority: path === "/" ? "1.0" : path === "/shop" ? "0.9" : "0.6" })),
    ...products.map((product) => ({ loc: `${base()}/product/${encodeURIComponent(product.slug)}`, lastmod: product.updatedAt.toISOString(), priority: "0.8" })),
    ...deals.map((deal) => ({ loc: `${base()}/offers/${encodeURIComponent(deal.slug)}`, lastmod: deal.updatedAt.toISOString(), priority: "0.7" })),
  ];
  const body = urls.map((item) => `<url><loc>${xml(item.loc)}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ""}<priority>${item.priority}</priority></url>`).join("");
  res.type("application/xml").set("Cache-Control", "public, max-age=900").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
}));

router.get("/google-merchant.xml", asyncHandler(async (_req, res) => {
  const settings = await getStoreSettings();
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      category: { select: { name: true } },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items: string[] = [];
  for (const product of products) {
    const image = product.images[0]?.url ? absolute(product.images[0].url) : "";
    if (!image) continue;
    for (const variant of product.variants) {
      const title = `${product.name}${variant.name ? ` - ${variant.name}` : ""}`.slice(0, 150);
      const description = (plain(product.shortDescription || product.description) || `${product.name} from ${settings.storeName}`).slice(0, 5000);
      const mrp = Number(variant.mrp || variant.sellingPrice || 0);
      const sale = Number(variant.sellingPrice || 0);
      const link = `${base()}/product/${encodeURIComponent(product.slug)}`;
      items.push(`<item>
<title>${xml(title)}</title>
<link>${xml(link)}</link>
<description>${xml(description)}</description>
<g:id>${xml(variant.sku || variant.id)}</g:id>
<g:brand>${xml(settings.storeName || "Riseora Herbals")}</g:brand>
<g:condition>new</g:condition>
<g:availability>${variant.stockQuantity > 0 ? "in_stock" : "out_of_stock"}</g:availability>
<g:price>${mrp.toFixed(2)} INR</g:price>
${sale < mrp ? `<g:sale_price>${sale.toFixed(2)} INR</g:sale_price>` : ""}
<g:image_link>${xml(image)}</g:image_link>
<g:product_type>${xml(product.category?.name || "Herbal care")}</g:product_type>
<g:identifier_exists>${variant.sku ? "yes" : "no"}</g:identifier_exists>
</item>`);
    }
  }

  res.type("application/xml").set("Cache-Control", "public, max-age=900").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>${xml(settings.storeName || "Riseora Herbals")}</title><link>${xml(base())}</link><description>${xml(settings.seoDescription || settings.brandTagline || "Riseora Herbals product feed")}</description>${items.join("")}</channel></rss>`);
}));

export default router;

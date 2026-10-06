import { prisma } from "../config/prisma";

type SavedShoppingEventType = "view" | "product_open" | "alert_create" | "add";
type SavedShoppingAlertType = "PRICE" | "STOCK";

type SavedShoppingEvent = {
  at: number;
  type: SavedShoppingEventType;
  alertType?: SavedShoppingAlertType;
};

const EVENT_WINDOW_MS = 60 * 60 * 1000;
const recentEvents: SavedShoppingEvent[] = [];

function trimEvents(now = Date.now()) {
  const cutoff = now - EVENT_WINDOW_MS;
  while (recentEvents.length && recentEvents[0].at < cutoff) recentEvents.shift();
  if (recentEvents.length > 5000) recentEvents.splice(0, recentEvents.length - 5000);
}

function publicAvailability(variant: any) {
  const stockQuantity = Math.max(0, Number(variant?.stockQuantity || 0));
  const safetyStock = Math.max(0, Number(variant?.safetyStock || 0));
  return Math.max(0, stockQuantity - safetyStock);
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function recordSavedShoppingEvent(type: SavedShoppingEventType, alertType?: SavedShoppingAlertType) {
  trimEvents();
  recentEvents.push({ at: Date.now(), type, ...(alertType ? { alertType } : {}) });
}

export function savedShoppingEngagementSnapshot() {
  trimEvents();
  const count = (type: SavedShoppingEventType) => recentEvents.filter((event) => event.type === type).length;
  const views = count("view");
  const alertCreates = count("alert_create");
  const productOpens = count("product_open");
  const assistedAdds = count("add");
  const priceWatchCreates = recentEvents.filter((event) => event.type === "alert_create" && event.alertType === "PRICE").length;
  const stockWatchCreates = recentEvents.filter((event) => event.type === "alert_create" && event.alertType === "STOCK").length;
  return {
    windowMinutes: 60,
    views,
    alertCreates,
    productOpens,
    assistedAdds,
    priceWatchCreates,
    stockWatchCreates,
    watchRatePercent: views ? Number(((alertCreates / views) * 100).toFixed(1)) : 0,
    addRatePercent: views ? Number(((assistedAdds / views) * 100).toFixed(1)) : 0,
  };
}

export async function getSavedShoppingIntelligence(userId: string) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  const email = account.email.toLowerCase();

  const [rows, priceAlerts, stockAlerts] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: { userId, product: { isActive: true } },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 2 },
            variants: { where: { isActive: true }, orderBy: { sellingPrice: "asc" } },
            reviews: { where: { isApproved: true }, select: { rating: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    prisma.priceAlert.findMany({
      where: { email, status: { in: ["PENDING", "NOTIFIED"] } },
      orderBy: { subscribedAt: "desc" },
      take: 250,
    }),
    prisma.stockAlert.findMany({
      where: { email, status: { in: ["PENDING", "NOTIFIED"] } },
      orderBy: { subscribedAt: "desc" },
      take: 250,
    }),
  ]);



  const items = rows.map((row) => {
    const product = row.product as any;
    const variants = (product.variants || []).map((variant: any) => ({
      ...variant,
      availableQuantity: publicAvailability(variant),
      sellingPrice: money(variant.sellingPrice),
      mrp: money(variant.mrp),
    }));
    const availableVariants = variants.filter((variant: any) => variant.availableQuantity > 0);
    const preferredVariant = availableVariants[0] || variants[0] || null;
    const variantIds = new Set(variants.map((variant: any) => variant.id));
    const productPriceAlerts = priceAlerts.filter((alert) => variantIds.has(alert.variantId));
    const productStockAlerts = stockAlerts.filter((alert) => variantIds.has(alert.variantId));
    const pendingPrice = productPriceAlerts.find((alert) => alert.status === "PENDING") || null;
    const pendingStock = productStockAlerts.find((alert) => alert.status === "PENDING") || null;
    const notifiedPrice = productPriceAlerts.find((alert) => alert.status === "NOTIFIED") || null;
    const notifiedStock = productStockAlerts.find((alert) => alert.status === "NOTIFIED") || null;
    const variantById = new Map(variants.map((variant: any) => [variant.id, variant]));
    const notifiedPriceVariant: any = notifiedPrice ? variantById.get(notifiedPrice.variantId) : null;
    const notifiedStockVariant: any = notifiedStock ? variantById.get(notifiedStock.variantId) : null;
    const totalAvailable = variants.reduce((sum: number, variant: any) => sum + variant.availableQuantity, 0);
    const ratings = product.reviews || [];
    const ratingAverage = ratings.length ? ratings.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / ratings.length : 0;

    let state = "READY";
    let headline = "Ready when you are";
    let detail = `${availableVariants.length} of ${variants.length} active pack${variants.length === 1 ? "" : "s"} available.`;
    if (notifiedPrice && notifiedPriceVariant && money(notifiedPriceVariant.sellingPrice) < money(notifiedPrice.subscribedPrice)) {
      state = "PRICE_DROP"; headline = "Price drop detected"; detail = `${notifiedPriceVariant.name} is now below the price you started watching.`;
    } else if (notifiedStock && notifiedStockVariant && notifiedStockVariant.availableQuantity > 0) {
      state = "BACK_IN_STOCK"; headline = "Back in stock"; detail = `${notifiedStockVariant.name} is available again. Stock can move quickly.`;
    } else if (totalAvailable <= 0 && pendingStock) {
      state = "STOCK_WATCH"; headline = "Back-in-stock watch active"; detail = "Riseora will notify you when the watched option becomes sellable again.";
    } else if (totalAvailable <= 0) {
      state = "OUT_OF_STOCK"; headline = "Currently unavailable"; detail = "You can explicitly start a back-in-stock watch from this wishlist.";
    } else if (pendingPrice) {
      state = "PRICE_WATCH"; headline = "Price watch active";
      detail = pendingPrice.targetPrice == null
        ? "Riseora will notify you if the watched option drops below its subscribed price."
        : `Target ₹${money(pendingPrice.targetPrice).toFixed(0)} or lower.`;
    }

    const watch = totalAvailable <= 0
      ? (!pendingStock && preferredVariant ? { type: "STOCK" as const, variantId: preferredVariant.id, variantName: preferredVariant.name } : null)
      : (!pendingPrice && preferredVariant ? { type: "PRICE" as const, variantId: preferredVariant.id, variantName: preferredVariant.name, currentPrice: money(preferredVariant.sellingPrice) } : null);

    return {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category?.name || null,
      image: product.images?.[0] || null,
      savedAt: row.createdAt,
      state,
      headline,
      detail,
      availableVariants: availableVariants.length,
      totalVariants: variants.length,
      availableQuantity: totalAvailable,
      startingPrice: preferredVariant ? money(preferredVariant.sellingPrice) : null,
      startingMrp: preferredVariant ? money(preferredVariant.mrp) : null,
      ratingAverage: Number(ratingAverage.toFixed(1)),
      reviewCount: ratings.length,
      priceWatch: pendingPrice ? {
        id: pendingPrice.id,
        variantId: pendingPrice.variantId,
        subscribedPrice: money(pendingPrice.subscribedPrice),
        targetPrice: pendingPrice.targetPrice == null ? null : money(pendingPrice.targetPrice),
      } : null,
      stockWatch: pendingStock ? { id: pendingStock.id, variantId: pendingStock.variantId } : null,
      watch,
    };
  });

  const summary = {
    savedProducts: items.length,
    readyNow: items.filter((item) => item.availableQuantity > 0).length,
    unavailable: items.filter((item) => item.availableQuantity <= 0).length,
    priceWatches: items.filter((item) => Boolean(item.priceWatch)).length,
    stockWatches: items.filter((item) => Boolean(item.stockWatch)).length,
    goodNews: items.filter((item) => item.state === "PRICE_DROP" || item.state === "BACK_IN_STOCK").length,
  };

  return {
    summary,
    items,
    consentNote: "Saving a product never subscribes the customer automatically. Price and stock watches start only after an explicit customer action.",
  };
}

export async function savedShoppingHealth() {
  const now = new Date();
  const [wishlistCount, wishlistRows, userRows, activePriceWatches, activeStockWatches, activeShares] = await Promise.all([
    prisma.wishlistItem.count(),
    prisma.wishlistItem.findMany({ select: { productId: true }, take: 10000 }),
    prisma.wishlistItem.findMany({ distinct: ["userId"], select: { userId: true }, take: 10000 }),
    prisma.priceAlert.count({ where: { status: "PENDING" } }),
    prisma.stockAlert.count({ where: { status: "PENDING" } }),
    prisma.wishlistShare.count({ where: { expiresAt: { gt: now } } }),
  ]);

  const counts = new Map<string, number>();
  for (const row of wishlistRows) counts.set(row.productId, (counts.get(row.productId) || 0) + 1);
  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const products = topIds.length
    ? await prisma.product.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true, slug: true } })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const topSaved = topIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [{ ...product, saves: counts.get(id) || 0 }] : [];
  });

  return {
    wishlistItems: wishlistCount,
    customersWithWishlist: userRows.length,
    activePriceWatches,
    activeStockWatches,
    activeSharedLists: activeShares,
    topSaved,
    engagement: savedShoppingEngagementSnapshot(),
    note: "Aggregate catalogue and watch counts only; customer identities are not returned by this endpoint.",
  };
}

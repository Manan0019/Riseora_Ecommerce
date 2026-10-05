import { prisma } from "../config/prisma";
import { slugify } from "../utils/slugify";

const MAX_INGREDIENTS_PER_PRODUCT = 40;
const MAX_INGREDIENT_LENGTH = 90;
const BLOCKED_LABELS = new Set(["ingredient", "ingredients", "key ingredient", "key ingredients", "full ingredient list"]);

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeDisplay(value: string) {
  return decodeEntities(value)
    .replace(/^[\s\-–—•·*]+/, "")
    .replace(/^ingredients?\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:]+$/, "")
    .trim();
}

function canonicalIngredient(value: string) {
  return normalizeDisplay(value)
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ingredientGuideFromText(value: unknown) {
  const prepared = String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(li|p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ");

  const seen = new Set<string>();
  const out: Array<{ name: string; slug: string; key: string }> = [];
  for (const raw of prepared.split(/[\n,;|•·]+/)) {
    const name = normalizeDisplay(raw);
    const key = canonicalIngredient(name);
    const words = key.split(/\s+/).filter(Boolean);
    if (!key || seen.has(key) || BLOCKED_LABELS.has(key)) continue;
    if (name.length < 2 || name.length > MAX_INGREDIENT_LENGTH || words.length > 10) continue;
    if (/^(and|with|contains|including|other)$/i.test(name)) continue;
    if (/https?:\/\//i.test(name)) continue;
    const slug = slugify(key);
    if (!slug) continue;
    seen.add(key);
    out.push({ name, slug, key });
    if (out.length >= MAX_INGREDIENTS_PER_PRODUCT) break;
  }
  return out;
}

type IngredientProductRow = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  ingredients: string | null;
  category: { id: string; name: string; slug: string };
  images: Array<{ id: string; url: string; altText: string | null; isPrimary: boolean }>;
  variants: Array<{ id: string; name: string; sellingPrice: any; mrp: any; stockQuantity: number; safetyStock: number }>;
};

async function ingredientProducts() {
  return prisma.product.findMany({
    where: { isActive: true, ingredients: { not: null } },
    select: {
      id: true,
      slug: true,
      name: true,
      shortDescription: true,
      ingredients: true,
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { id: true, url: true, altText: true, isPrimary: true } },
      variants: {
        where: { isActive: true },
        orderBy: { sellingPrice: "asc" },
        select: { id: true, name: true, sellingPrice: true, mrp: true, stockQuantity: true, safetyStock: true },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
  }) as Promise<IngredientProductRow[]>;
}

function publicProduct(product: IngredientProductRow) {
  const variants = (product.variants || []).map((variant) => {
    const availableQuantity = Math.max(0, Number(variant.stockQuantity || 0) - Math.max(0, Number(variant.safetyStock || 0)));
    return { ...variant, stockQuantity: availableQuantity, availableQuantity };
  });
  const positivePrices = variants.map((variant) => Number(variant.sellingPrice || 0)).filter((price) => price > 0);
  const startingPrice = positivePrices.length ? Math.min(...positivePrices) : 0;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    category: product.category,
    images: product.images,
    variants,
    startingPrice,
    available: variants.some((variant) => variant.availableQuantity > 0),
  };
}

function buildIndex(rows: IngredientProductRow[]) {
  const map = new Map<string, {
    key: string;
    name: string;
    slug: string;
    productIds: Set<string>;
    categoryIds: Set<string>;
    products: IngredientProductRow[];
  }>();
  for (const product of rows) {
    for (const ingredient of ingredientGuideFromText(product.ingredients)) {
      const existing = map.get(ingredient.key) || {
        key: ingredient.key,
        name: ingredient.name,
        slug: ingredient.slug,
        productIds: new Set<string>(),
        categoryIds: new Set<string>(),
        products: [],
      };
      if (!existing.productIds.has(product.id)) existing.products.push(product);
      existing.productIds.add(product.id);
      existing.categoryIds.add(product.category.id);
      map.set(ingredient.key, existing);
    }
  }
  return map;
}

export async function ingredientLibrary(query = "", limit = 120) {
  const rows = await ingredientProducts();
  const map = buildIndex(rows);
  const q = query.trim().toLowerCase();
  return [...map.values()]
    .filter((item) => !q || item.name.toLowerCase().includes(q))
    .sort((a, b) => b.productIds.size - a.productIds.size || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(200, limit)))
    .map((item) => ({
      name: item.name,
      slug: item.slug,
      productCount: item.productIds.size,
      categoryCount: item.categoryIds.size,
      availableProductCount: item.products.filter((product) => publicProduct(product).available).length,
      sampleProducts: item.products.slice(0, 3).map(publicProduct),
    }));
}

export async function ingredientDetail(slug: string) {
  const rows = await ingredientProducts();
  const map = buildIndex(rows);
  const target = [...map.values()].find((item) => item.slug === slug);
  if (!target) return null;

  const co = new Map<string, { name: string; slug: string; count: number }>();
  for (const product of target.products) {
    for (const ingredient of ingredientGuideFromText(product.ingredients)) {
      if (ingredient.key === target.key) continue;
      const current = co.get(ingredient.key) || { name: ingredient.name, slug: ingredient.slug, count: 0 };
      current.count += 1;
      co.set(ingredient.key, current);
    }
  }

  const products = target.products.map(publicProduct).sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
  return {
    name: target.name,
    slug: target.slug,
    productCount: target.productIds.size,
    categoryCount: target.categoryIds.size,
    categories: [...new Map(target.products.map((product) => [product.category.id, product.category])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    products,
    relatedIngredients: [...co.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 12),
    guidance: {
      source: "Riseora product catalogue",
      note: "Ingredient names are derived from current Riseora product information. Always check the individual product label and product-specific directions for the complete formula and usage instructions.",
      safety: "This library is for catalogue education, not diagnosis or medical treatment advice. For allergies, pregnancy, medical conditions, or persistent irritation, seek advice from a qualified professional before use.",
    },
  };
}

export async function ingredientCatalogHealth() {
  const [activeProducts, rows] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, ingredients: true, howToUse: true, suitableFor: true, benefits: true },
      orderBy: { name: "asc" },
    }),
    ingredientProducts(),
  ]);
  const map = buildIndex(rows);
  const withParsedIngredients = activeProducts.filter((product) => ingredientGuideFromText(product.ingredients).length > 0);
  const pct = (count: number) => activeProducts.length ? Number(((count / activeProducts.length) * 100).toFixed(1)) : 0;
  return {
    activeProducts: activeProducts.length,
    productsWithIngredients: withParsedIngredients.length,
    ingredientCoverage: pct(withParsedIngredients.length),
    productsWithUsage: activeProducts.filter((product) => Boolean(String(product.howToUse || "").trim())).length,
    usageCoverage: pct(activeProducts.filter((product) => Boolean(String(product.howToUse || "").trim())).length),
    productsWithSuitableFor: activeProducts.filter((product) => Boolean(String(product.suitableFor || "").trim())).length,
    benefitsCoverage: pct(activeProducts.filter((product) => Boolean(String(product.benefits || "").trim())).length),
    uniqueIngredients: map.size,
    topIngredients: [...map.values()].sort((a, b) => b.productIds.size - a.productIds.size || a.name.localeCompare(b.name)).slice(0, 8).map((item) => ({ name: item.name, slug: item.slug, products: item.productIds.size })),
    missingIngredientProducts: activeProducts.filter((product) => ingredientGuideFromText(product.ingredients).length === 0).slice(0, 8).map((product) => ({ id: product.id, name: product.name, slug: product.slug })),
  };
}

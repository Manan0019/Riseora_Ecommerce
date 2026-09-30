import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "../context/StoreContext";

function upsertMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) { node = document.createElement("meta"); document.head.appendChild(node); }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
}

export default function Seo({ title, description, image, type = "website", noindex = false, jsonLd }) {
  const { store } = useStore();
  const location = useLocation();
  useEffect(() => {
    const brand = store.storeName || "Riseora Herbals";
    const finalTitle = title ? `${title} | ${brand}` : (store.seoTitle || `${brand} | Herbal Care`);
    const finalDescription = description || store.seoDescription || store.brandTagline || "Shop Riseora Herbals online.";
    const base = (store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonical = `${base}${location.pathname}`;
    document.title = finalTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: finalDescription });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noindex ? "noindex,nofollow" : "index,follow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: finalTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: finalDescription });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: image ? "summary_large_image" : "summary" });
    if (image) {
      const absoluteImage = image.startsWith("http") ? image : `${base}${image}`;
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: absoluteImage });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: absoluteImage });
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove();
      document.head.querySelector('meta[name="twitter:image"]')?.remove();
    }
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
    link.setAttribute("href", canonical);
    const old = document.getElementById("riseora-jsonld");
    old?.remove();
    if (jsonLd) {
      const script = document.createElement("script"); script.id = "riseora-jsonld"; script.type = "application/ld+json"; script.textContent = JSON.stringify(jsonLd); document.head.appendChild(script);
    }
    return () => document.getElementById("riseora-jsonld")?.remove();
  }, [title, description, image, type, noindex, jsonLd, location.pathname, store]);
  return null;
}

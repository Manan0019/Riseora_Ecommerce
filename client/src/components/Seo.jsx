import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { useStore } from "../context/StoreContext";

function upsertMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) { node = document.createElement("meta"); document.head.appendChild(node); }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
}

function absoluteUrl(value, base) {
  if (!value) return "";
  const text = String(value);
  if (/^https?:\/\//i.test(text)) return text;
  return `${base}${text.startsWith("/") ? "" : "/"}${text}`;
}

export default function Seo({ title, description, image, imageAlt, type = "website", noindex = false, jsonLd }) {
  const { store } = useStore();
  const location = useLocation();

  useEffect(() => {
    const brand = store.storeName || "Riseora Herbals";
    const finalTitle = title ? `${title} | ${brand}` : (store.seoTitle || `${brand} | Herbal Care`);
    const finalDescription = String(description || store.seoDescription || store.brandTagline || "Shop Riseora Herbals online.").slice(0, 320);
    const base = (store.siteUrl || import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
    const canonical = `${base}${location.pathname === "/" ? "" : location.pathname}`;
    const fallbackImage = store.logoUrl ? mediaUrl(store.logoUrl) : "";
    const socialImage = image || fallbackImage;
    const absoluteImage = socialImage ? absoluteUrl(socialImage, base) : "";

    document.title = finalTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: finalDescription });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noindex ? "noindex,nofollow,noarchive" : "index,follow,max-image-preview:large" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: finalTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: finalDescription });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: brand });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: "en_IN" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: absoluteImage ? "summary_large_image" : "summary" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: finalTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: finalDescription });

    const verification = String(import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || "").trim();
    if (verification) upsertMeta('meta[name="google-site-verification"]', { name: "google-site-verification", content: verification });
    else document.head.querySelector('meta[name="google-site-verification"]')?.remove();

    if (absoluteImage) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: absoluteImage });
      upsertMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: imageAlt || title || brand });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: absoluteImage });
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove();
      document.head.querySelector('meta[property="og:image:alt"]')?.remove();
      document.head.querySelector('meta[name="twitter:image"]')?.remove();
    }

    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
    link.setAttribute("href", canonical);

    document.querySelectorAll('script[data-riseora-jsonld="true"]').forEach((node) => node.remove());
    if (jsonLd) {
      const payloads = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      payloads.filter(Boolean).forEach((payload, index) => {
        const script = document.createElement("script");
        script.dataset.riseoraJsonld = "true";
        script.id = `riseora-jsonld-${index}`;
        script.type = "application/ld+json";
        script.textContent = JSON.stringify(payload);
        document.head.appendChild(script);
      });
    }

    return () => document.querySelectorAll('script[data-riseora-jsonld="true"]').forEach((node) => node.remove());
  }, [title, description, image, imageAlt, type, noindex, jsonLd, location.pathname, store]);

  return null;
}

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { preloadRoutePath } from "../lib/route-modules";
import { startBrowserPerformanceTelemetry } from "../lib/web-performance";

const prefetched = new Set();

function shouldPrefetch() {
  if (typeof navigator === "undefined") return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return false;
  return !["slow-2g", "2g"].includes(String(connection?.effectiveType || "").toLowerCase());
}

function internalPathFromAnchor(anchor) {
  if (!anchor || anchor.dataset?.noPrefetch === "true") return null;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function prefetch(path) {
  if (!path || !shouldPrefetch() || prefetched.has(path)) return;
  prefetched.add(path);
  preloadRoutePath(path).catch(() => prefetched.delete(path));
}

function idleTargets(pathname) {
  if (pathname === "/") return ["/shop", "/offers"];
  if (pathname.startsWith("/shop")) return ["/cart"];
  if (pathname.startsWith("/product/")) return ["/cart"];
  if (pathname === "/cart") return ["/checkout"];
  if (pathname === "/account") return ["/orders"];
  if (pathname === "/admin") return ["/admin/orders"];
  return [];
}

export default function RoutePerformanceBridge() {
  const { pathname } = useLocation();

  useEffect(() => startBrowserPerformanceTelemetry(), []);

  useEffect(() => {
    function onIntent(event) {
      const anchor = event.target?.closest?.("a[href]");
      prefetch(internalPathFromAnchor(anchor));
    }
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    document.addEventListener("touchstart", onIntent, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
      document.removeEventListener("touchstart", onIntent);
    };
  }, []);

  useEffect(() => {
    if (!shouldPrefetch()) return undefined;
    const work = () => idleTargets(pathname).slice(0, 2).forEach(prefetch);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(work, { timeout: 2200 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(work, 900);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}

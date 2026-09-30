import { useState } from "react";
import { mediaUrl } from "../api/http";
import { useStore } from "../context/StoreContext";

const DEFAULT_HORIZONTAL = "/brand/riseora-logo-Horizontal.png";
const DEFAULT_VERTICAL = "/brand/riseora-Logo-Vertical.png";

export default function BrandLogo({ compact = false, admin = false, variant, className = "" }) {
  const { store } = useStore();
  const [failed, setFailed] = useState(false);
  const mode = variant || (compact ? "vertical" : "horizontal");
  const adminConfigured = mode === "vertical" ? (store.logoMarkUrl || store.logoUrl) : (store.logoUrl || store.logoMarkUrl);
  const source = adminConfigured ? mediaUrl(adminConfigured) : (mode === "vertical" ? DEFAULT_VERTICAL : DEFAULT_HORIZONTAL);
  const alt = store.logoAlt || store.storeName || "Riseora Herbals";

  if (source && !failed) {
    return (
      <span className={`brand-logo-image-shell ${mode} ${compact ? "compact" : "full"} ${admin ? "admin" : ""} ${className}`.trim()}>
        <img src={source} alt={alt} className="brand-logo-image" onError={() => setFailed(true)} />
      </span>
    );
  }

  if (compact || mode === "vertical") return <span className="brand-mark">R</span>;
  return <span className="brand-copy text-fallback"><strong>RISEORA</strong><small>{admin ? "ADMIN" : "HERBALS"}</small></span>;
}

import { mediaUrl } from "../api/http";
import { useStore } from "../context/StoreContext";

export default function BrandLogo({ compact = false, admin = false, className = "" }) {
  const { store } = useStore();
  const fullLogo = mediaUrl(store.logoUrl);
  const markLogo = mediaUrl(store.logoMarkUrl);
  const alt = store.logoAlt || store.storeName || "Riseora Herbals";
  const source = compact ? (markLogo || fullLogo) : (fullLogo || markLogo);

  if (source) {
    return (
      <span className={`brand-logo-image-shell ${compact ? "compact" : "full"} ${admin ? "admin" : ""} ${className}`.trim()}>
        <img src={source} alt={alt} className="brand-logo-image" />
      </span>
    );
  }

  if (compact) return <span className="brand-mark">R</span>;

  return (
    <>
      <span className="brand-mark">R</span>
      <span className="brand-copy"><strong>RISEORA</strong><small>{admin ? "ADMIN" : "HERBALS"}</small></span>
    </>
  );
}

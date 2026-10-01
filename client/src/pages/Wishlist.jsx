import { useState } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "../components/Icons";
import { apiFetch } from "../api/http";

export default function Wishlist() {
  const { items } = useWishlist();
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function shareWishlist() {
    if (!items.length || sharing) return;
    setSharing(true); setMessage(""); setError("");
    try {
      const response = await apiFetch("/wishlist/share", {
        method: "POST",
        body: JSON.stringify({ title: "My Riseora wishlist", productIds: items.map((item) => item.id) }),
      });
      const url = `${window.location.origin}/wishlist/shared/${response.data.token}`;
      if (navigator.share) {
        await navigator.share({ title: "My Riseora wishlist", text: "Products I saved from Riseora Herbals", url });
        setMessage("Wishlist shared. The private link expires in 30 days.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage("Private wishlist link copied. It expires in 30 days.");
      } else {
        window.prompt("Copy this wishlist link", url);
        setMessage("Wishlist link created. It expires in 30 days.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setError(e.message || "Could not share wishlist");
    } finally { setSharing(false); }
  }

  return (
    <div className="container page-space wishlist-page">
      <div className="shop-title-row phase23-wishlist-head"><div><p className="eyebrow">SAVED FOR LATER</p><h1>Your wishlist</h1><p className="muted">Keep favourites close while you decide.</p></div>{items.length > 0 && <button className="button button-secondary phase23-share-wishlist" type="button" onClick={shareWishlist} disabled={sharing}><Icon name="share" size={17} /> {sharing ? "Creating link…" : "Share wishlist"}</button>}</div>
      {message && <p className="alert success">{message}</p>}
      {error && <p className="alert error">{error}</p>}
      {items.length === 0 ? (
        <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="heart" /></span><h3>No favourites yet</h3><p>Tap the heart on any product to save it here.</p><Link className="button" to="/shop">Explore products</Link></div>
      ) : <><div className="phase23-share-note"><strong>Share privately</strong><span>Shared links contain product choices only—no account, email or address details—and expire after 30 days.</span></div><div className="product-grid shop-grid">{items.map((product) => <ProductCard key={product.id} product={product} compact />)}</div></>}
    </div>
  );
}

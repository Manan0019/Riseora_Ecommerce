import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "../components/Icons";

export default function Wishlist() {
  const { items } = useWishlist();
  return (
    <div className="container page-space wishlist-page">
      <div className="shop-title-row"><div><p className="eyebrow">SAVED FOR LATER</p><h1>Your wishlist</h1><p className="muted">Keep favourites close while you decide.</p></div></div>
      {items.length === 0 ? (
        <div className="empty-state premium-empty"><span className="empty-icon"><Icon name="heart" /></span><h3>No favourites yet</h3><p>Tap the heart on any product to save it here.</p><Link className="button" to="/shop">Explore products</Link></div>
      ) : <div className="product-grid shop-grid">{items.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>}
    </div>
  );
}

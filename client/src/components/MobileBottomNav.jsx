import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";

export default function MobileBottomNav() {
  const { user } = useAuth();
  const { count } = useCart();
  const { count: saved } = useWishlist();
  const items = [
    { to: "/", label: "Home", icon: "home", end: true },
    { to: "/shop", label: "Shop", icon: "shop" },
    { to: "/wishlist", label: "Saved", icon: "heart", count: saved },
    { to: user ? "/orders" : "/login", label: user ? "Orders" : "Account", icon: "user" },
    { to: "/cart", label: "Cart", icon: "cart", count },
  ];
  return <nav className="mobile-bottom-nav phase3-bottom-nav" aria-label="Mobile navigation">{items.map((item) => <NavLink key={item.label} to={item.to} end={item.end} className={({ isActive }) => isActive ? "mobile-nav-item active" : "mobile-nav-item"}><span className="mobile-nav-icon"><Icon name={item.icon} size={20} />{item.count > 0 && <span className="mobile-cart-count">{item.count > 9 ? "9+" : item.count}</span>}</span><span>{item.label}</span></NavLink>)}</nav>;
}

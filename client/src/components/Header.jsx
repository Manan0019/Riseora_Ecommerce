import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { count: wishlistCount } = useWishlist();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!searchOpen) setSearch("");
  }, [searchOpen]);

  function submitSearch(event) {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    setSearchOpen(false);
    navigate(`/shop?search=${encodeURIComponent(value)}`);
  }

  return (
    <>
      <header className="site-header phase3-header">
        <div className="announcement mc-announcement">
          <span>FREE SHIPPING ON ORDERS ABOVE ₹599</span><span className="announcement-dot">•</span><span>HERBAL CARE, MADE FOR EVERYDAY</span>
        </div>
        <div className="container nav-row">
          <Link className="brand" to="/" aria-label="Riseora home">
            <span className="brand-mark">R</span>
            <span className="brand-copy"><strong>RISEORA</strong><small>HERBALS</small></span>
          </Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/" end>Home</NavLink><NavLink to="/shop">Shop</NavLink><NavLink to="/offers">Offers</NavLink><NavLink to="/wishlist">Wishlist</NavLink>{user && <NavLink to="/orders">Orders</NavLink>}
          </nav>
          <div className="nav-actions">
            <button className="icon-action" onClick={() => setSearchOpen(true)} aria-label="Search"><Icon name="search" size={21} /></button>
            <Link className="icon-action desktop-wishlist-action" to="/wishlist" aria-label="Wishlist"><Icon name="heart" size={20} />{wishlistCount > 0 && <b>{wishlistCount > 9 ? "9+" : wishlistCount}</b>}</Link>
            {user?.role === "ADMIN" && <Link className="admin-shortcut" to="/admin">Admin</Link>}
            <Link className="icon-action account-action" to={user ? "/account" : "/login"} aria-label={user ? "My account" : "Login"}><Icon name="user" size={20} /><span>{user ? user.firstName : "Login"}</span></Link>
            {user && <button className="icon-action logout-action" onClick={logout} aria-label="Logout"><Icon name="logout" size={19} /></button>}
            <Link className="icon-action cart-action" to="/cart" aria-label={`Cart with ${count} items`}><Icon name="cart" size={21} /><span className="desktop-cart-label">Cart</span>{count > 0 && <b>{count > 99 ? "99+" : count}</b>}</Link>
          </div>
        </div>
      </header>
      {searchOpen && <div className="search-drawer-backdrop" onMouseDown={() => setSearchOpen(false)}>
        <div className="search-drawer" onMouseDown={(e) => e.stopPropagation()}>
          <div className="search-drawer-head"><div><small>WHAT ARE YOU LOOKING FOR?</small><strong>Search Riseora</strong></div><button onClick={() => setSearchOpen(false)} aria-label="Close search"><Icon name="close" /></button></div>
          <form className="global-search-form" onSubmit={submitSearch}><Icon name="search" size={22} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hair oil, herbal care…" /><button className="button" type="submit">Search</button></form>
          <div className="search-suggestions"><span>POPULAR</span><Link to="/shop" onClick={() => setSearchOpen(false)}>All products</Link><Link to="/offers" onClick={() => setSearchOpen(false)}>Latest offers</Link></div>
        </div>
      </div>}
    </>
  );
}

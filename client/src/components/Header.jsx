import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { readPersistedArray } from "../lib/persisted-state";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { Icon } from "./Icons";
import BrandLogo from "./BrandLogo";
import { useStore } from "../context/StoreContext";
import NotificationBell from "./NotificationBell";
import SmartSearch from "./SmartSearch";

const SEARCH_KEY = "riseora_recent_searches";
const RECENT_PRODUCT_KEY = "riseora_recent_products";
const EMPTY_INTELLIGENCE = { products: [], categories: [], didYouMean: null, relatedTerms: [], resultCount: 0, rescueProducts: [] };

function readJson(key, fallback = []) {
  if (typeof window === "undefined") return fallback;
  const value = readPersistedArray(window.localStorage, key, { maxItems: key === SEARCH_KEY ? 20 : 20 });
  return Array.isArray(value) ? value : fallback;
}
function rememberSearch(value) {
  try {
    const clean = value.trim();
    if (!clean) return;
    const next = [clean, ...readJson(SEARCH_KEY).filter((item) => String(item).toLowerCase() !== clean.toLowerCase())].slice(0, 6);
    localStorage.setItem(SEARCH_KEY, JSON.stringify(next));
  } catch { /* recent search is optional */ }
}

export default function Header() {
  const { user, logout } = useAuth();
  const { count, openCart } = useCart();
  const { count: wishlistCount } = useWishlist();
  const { store } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState(EMPTY_INTELLIGENCE);
  const [searching, setSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [recentProducts, setRecentProducts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!searchOpen) {
      setSearch("");
      setSuggestions(EMPTY_INTELLIGENCE);
      setSearching(false);
      return;
    }
    setRecentSearches(readJson(SEARCH_KEY));
    setRecentProducts(readJson(RECENT_PRODUCT_KEY).slice(0, 4));
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const query = search.trim();
    if (query.length < 2) {
      setSuggestions(EMPTY_INTELLIGENCE);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      apiFetch(`/products/search/intelligence?q=${encodeURIComponent(query)}&limit=6&source=header`)
        .then((response) => { if (!cancelled) setSuggestions(response.data || EMPTY_INTELLIGENCE); })
        .catch(() => { if (!cancelled) setSuggestions(EMPTY_INTELLIGENCE) })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [search, searchOpen]);

  function closeSearch() { setSearchOpen(false); }
  function submitSearch(event) {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    rememberSearch(value);
    closeSearch();
    navigate(`/shop?search=${encodeURIComponent(value)}`);
  }
  function useRecent(term) {
    rememberSearch(term);
    closeSearch();
    navigate(`/shop?search=${encodeURIComponent(term)}`);
  }
  function clearRecent() {
    try { localStorage.removeItem(SEARCH_KEY); } catch { /* ignore */ }
    setRecentSearches([]);
  }

  const hasQuery = search.trim().length >= 2;
  const hasSuggestions = suggestions.products?.length > 0 || suggestions.categories?.length > 0 || suggestions.didYouMean || suggestions.relatedTerms?.length > 0 || suggestions.rescueProducts?.length > 0;

  return (
    <>
      <header className="site-header phase3-header">
        <div className="announcement mc-announcement">
          <span>{store.announcementText || (store.freeShippingThreshold ? `FREE SHIPPING ON ORDERS ABOVE ₹${Number(store.freeShippingThreshold).toFixed(0)}` : "RISEORA HERBALS")}</span><span className="announcement-dot">•</span><span>{store.announcementSecondary || "HERBAL CARE, MADE FOR EVERYDAY"}</span>
        </div>
        <div className="container nav-row">
          <Link className="brand" to="/" aria-label="Riseora home">
            <BrandLogo />
          </Link>
          <nav className="main-nav" aria-label="Primary navigation">
            <NavLink to="/" end>Home</NavLink><NavLink to="/shop">Shop</NavLink><NavLink to="/routine-builder">Routine</NavLink><NavLink to="/ingredients">Ingredients</NavLink><NavLink to="/offers">Offers</NavLink><NavLink to="/about">About</NavLink><NavLink to="/contact">Contact</NavLink>{user && <NavLink to="/orders">Orders</NavLink>}
          </nav>
          <div className="nav-actions">
            <button className="icon-action" onClick={() => setSearchOpen(true)} aria-label="Search"><Icon name="search" size={21} /></button>
            <Link className="icon-action desktop-wishlist-action" to="/wishlist" aria-label="Wishlist"><Icon name="heart" size={20} />{wishlistCount > 0 && <b>{wishlistCount > 9 ? "9+" : wishlistCount}</b>}</Link>
            <NotificationBell />
            {user?.role === "ADMIN" && <Link className="admin-shortcut" to="/admin">Admin</Link>}
            <Link className="icon-action account-action" to={user ? "/account" : "/login"} aria-label={user ? "My account" : "Login"}><Icon name="user" size={20} /><span>{user ? user.firstName : "Login"}</span></Link>
            {user && <button className="icon-action logout-action" onClick={logout} aria-label="Logout"><Icon name="logout" size={19} /></button>}
            <button className="icon-action cart-action" type="button" onClick={openCart} aria-label={`Open cart with ${count} items`}><Icon name="cart" size={21} /><span className="desktop-cart-label">Cart</span>{count > 0 && <b>{count > 99 ? "99+" : count}</b>}</button>
          </div>
        </div>
      </header>
      {searchOpen && <div className="search-drawer-backdrop phase16-search-layer" onMouseDown={closeSearch}>
        <div className="search-drawer phase16-search-drawer" onMouseDown={(e) => e.stopPropagation()}>
          <div className="search-drawer-head"><div><small>DISCOVER RISEORA</small><strong>Search products</strong></div><button onClick={closeSearch} aria-label="Close search"><Icon name="close" /></button></div>
          <form className="global-search-form phase16-global-search" onSubmit={submitSearch}><Icon name="search" size={22} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hair oil, benefits, size or SKU…" /><button className="button" type="submit">Search</button></form>

          {!hasQuery && <div className="phase16-search-start">
            {recentSearches.length > 0 && <section><div className="phase16-search-section-head"><span>RECENT SEARCHES</span><button type="button" onClick={clearRecent}>Clear</button></div><div className="phase16-recent-chips">{recentSearches.map((term) => <button type="button" key={term} onClick={() => useRecent(term)}><Icon name="search" size={13} />{term}</button>)}</div></section>}
            {recentProducts.length > 0 && <section><div className="phase16-search-section-head"><span>RECENTLY VIEWED</span><Link to="/shop" onClick={closeSearch}>View shop</Link></div><div className="phase16-recent-products">{recentProducts.map((item) => { const image = item.images?.find((row) => row.isPrimary) || item.images?.[0]; const variant = item.variants?.[0]; return <Link key={item.id} to={`/product/${item.slug}`} onClick={closeSearch}><div>{image?.url ? <img src={mediaUrl(image.url)} alt="" /> : <span>R</span>}</div><p><strong>{item.name}</strong><small>{variant ? `₹${Number(variant.sellingPrice || 0).toFixed(0)}` : item.category?.name || "Riseora"}</small></p></Link>; })}</div></section>}
            <section><div className="phase16-search-section-head"><span>POPULAR</span></div><div className="search-suggestions phase16-popular-links"><Link to="/shop" onClick={closeSearch}>All products</Link><Link to="/offers" onClick={closeSearch}>Latest offers</Link><Link to="/routine-builder" onClick={closeSearch}>Build a routine</Link></div></section>
          </div>}

          {hasQuery && <div className="phase16-live-search" aria-live="polite">
            {searching && <div className="phase16-searching"><span /><span /><span /> Searching Riseora…</div>}
            {!searching && hasSuggestions && <>
              {suggestions.categories?.length > 0 && <section><div className="phase16-search-section-head"><span>CATEGORIES</span></div><div className="phase16-category-results">{suggestions.categories.map((category) => <Link key={category.id} to={`/shop?category=${category.slug}`} onClick={closeSearch}><Icon name="tag" size={15} />{category.name}<Icon name="arrow" size={13} /></Link>)}</div></section>}
              {(suggestions.products?.length > 0 || suggestions.rescueProducts?.length > 0) && <section><div className="phase16-search-section-head"><span>{suggestions.products?.length ? "PRODUCTS" : "POPULAR PICKS"}</span>{suggestions.products?.length ? <button type="button" onClick={submitSearch}>See all results</button> : <button type="button" onClick={() => { closeSearch(); navigate("/shop"); }}>Browse all</button>}</div><div className="phase16-product-results">{(suggestions.products?.length ? suggestions.products : suggestions.rescueProducts).map((product) => { const image = product.images?.find((row) => row.isPrimary) || product.images?.[0]; const variant = product.variants?.[0]; return <Link key={product.id} to={`/product/${product.slug}`} onClick={() => { rememberSearch(search); closeSearch(); }}><div className="phase16-search-thumb">{image?.url ? <img src={mediaUrl(image.url)} alt="" /> : <span>R</span>}</div><div><small>{product.category?.name || "Riseora"}</small><strong>{product.name}</strong>{variant && <b>₹{Number(variant.sellingPrice || 0).toFixed(0)}</b>}</div><Icon name="arrow" size={15} /></Link>; })}</div></section>}
              <SmartSearch intelligence={suggestions} query={search} compact onSearch={useRecent} />
            </>}
            {!searching && !hasSuggestions && <div className="phase16-search-empty"><Icon name="search" size={26} /><strong>No quick matches</strong><p>Press Search to look through the full catalogue for “{search.trim()}”.</p><button className="button button-secondary" type="button" onClick={() => { rememberSearch(search); closeSearch(); navigate(`/shop?search=${encodeURIComponent(search.trim())}`); }}>SEARCH ALL PRODUCTS</button></div>}
          </div>}
        </div>
      </div>}
    </>
  );
}

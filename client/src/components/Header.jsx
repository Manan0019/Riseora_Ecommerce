import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Icon } from "./Icons";

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();

  return (
    <header className="site-header">
      <div className="announcement">
        <span>Herbal care, thoughtfully made</span>
        <span className="announcement-dot">•</span>
        <span>Orders across India</span>
      </div>

      <div className="container nav-row">
        <Link className="brand" to="/" aria-label="Riseora home">
          <span className="brand-mark">R</span>
          <span className="brand-copy">
            <strong>RISEORA</strong>
            <small>HERBALS</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/shop">Shop</NavLink>
          <NavLink to="/offers">Offers</NavLink>
          {user && <NavLink to="/orders">My Orders</NavLink>}
        </nav>

        <div className="nav-actions">
          {user?.role === "ADMIN" && <Link className="admin-shortcut" to="/admin">Admin</Link>}
          <Link className="icon-action account-action" to={user ? "/orders" : "/login"} aria-label={user ? "My orders" : "Login"}>
            <Icon name="user" size={20} />
            <span>{user ? user.firstName : "Login"}</span>
          </Link>
          {user && (
            <button className="icon-action logout-action" onClick={logout} aria-label="Logout">
              <Icon name="logout" size={19} />
            </button>
          )}
          <Link className="icon-action cart-action" to="/cart" aria-label={`Cart with ${count} items`}>
            <Icon name="cart" size={21} />
            <span className="desktop-cart-label">Cart</span>
            {count > 0 && <b>{count > 99 ? "99+" : count}</b>}
          </Link>
        </div>
      </div>
    </header>
  );
}

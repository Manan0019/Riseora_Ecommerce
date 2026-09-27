import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();

  return (
    <header className="site-header">
      <div className="announcement">Herbal care, thoughtfully made • Orders across India</div>
      <div className="container nav-row">
        <Link className="brand" to="/" aria-label="Riseora home">
          <span className="brand-mark">R</span>
          <span>
            <strong>RISEORA</strong>
            <small>HERBALS</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Primary navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/shop">Shop</NavLink>
          {user && <NavLink to="/orders">My Orders</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        </nav>

        <div className="nav-actions">
          {user ? (
            <button className="link-button" onClick={logout}>Logout</button>
          ) : (
            <Link to="/login">Login</Link>
          )}
          <Link className="cart-link" to="/cart">Cart <span>{count}</span></Link>
        </div>
      </div>
    </header>
  );
}

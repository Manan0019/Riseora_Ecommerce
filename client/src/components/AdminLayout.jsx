import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icons";

const nav = [
  { to: "/admin", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/admin/catalog", label: "Catalog", icon: "package" },
  { to: "/admin/inventory", label: "Inventory", icon: "tag" },
  { to: "/admin/orders", label: "Orders", icon: "orders" },
  { to: "/admin/customers", label: "Customers", icon: "user" },
  { to: "/admin/promotions", label: "Promotions", icon: "tag" },
  { to: "/admin/returns", label: "Returns", icon: "truck" },
  { to: "/admin/settings", label: "Settings", icon: "shield" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="brand-mark">R</span>
          <div><strong>RISEORA</strong><small>ADMIN</small></div>
        </div>
        <nav className="admin-nav">
          {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} size={20} /><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" className="admin-store-link">View storefront →</a>
          <button onClick={logout}><Icon name="logout" size={18} /> Logout</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-mobile-brand">RISEORA ADMIN</span><strong>{user?.firstName ? `Hi, ${user.firstName}` : "Store admin"}</strong></div>
          <a href="/" className="admin-view-store">View store</a>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>

      <nav className="admin-mobile-nav" aria-label="Admin navigation">
        {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} size={20} /><span>{item.label}</span></NavLink>)}
      </nav>
    </div>
  );
}

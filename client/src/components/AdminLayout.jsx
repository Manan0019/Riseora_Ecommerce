import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icons";
import BrandLogo from "./BrandLogo";

const nav = [
  { to: "/admin", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/admin/catalog", label: "Catalog", icon: "package" },
  { to: "/admin/reports", label: "Reports", icon: "sparkles" },
  { to: "/admin/inventory", label: "Inventory", icon: "tag" },
  { to: "/admin/orders", label: "Orders", icon: "orders" },
  { to: "/admin/customers", label: "Customers", icon: "user" },
  { to: "/admin/promotions", label: "Promotions", icon: "tag" },
  { to: "/admin/merchandising", label: "Merchandising", icon: "sparkles" },
  { to: "/admin/reviews", label: "Reviews", icon: "star" },
  { to: "/admin/returns", label: "Returns", icon: "truck" },
  { to: "/admin/audience", label: "Audience", icon: "mail" },
  { to: "/admin/settings", label: "Settings", icon: "shield" },
  { to: "/admin/system", label: "System", icon: "dashboard" },
];
const mobilePrimaryPaths = new Set(["/admin", "/admin/orders", "/admin/catalog", "/admin/inventory"]);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobilePrimary = nav.filter((item) => mobilePrimaryPaths.has(item.to));
  const mobileMore = nav.filter((item) => !mobilePrimaryPaths.has(item.to));
  const moreActive = useMemo(() => mobileMore.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)), [pathname]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [moreOpen]);

  return (
    <div className="admin-shell phase15-admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <BrandLogo compact admin />
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
        <header className="admin-topbar phase15-admin-topbar">
          <div><span className="admin-mobile-brand">RISEORA ADMIN</span><strong>{user?.firstName ? `Hi, ${user.firstName}` : "Store admin"}</strong></div>
          <a href="/" className="admin-view-store">View store</a>
        </header>
        <main className="admin-content"><div key={pathname} className="phase18-route-frame"><Outlet /></div></main>
      </div>

      <nav className="admin-mobile-nav phase15-admin-mobile-dock" aria-label="Admin navigation">
        {mobilePrimary.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} size={20} /><span>{item.label}</span></NavLink>)}
        <button type="button" className={moreActive || moreOpen ? "active" : ""} onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-controls="admin-more-menu"><Icon name="menu" size={20} /><span>More</span></button>
      </nav>

      {moreOpen && <div className="phase15-admin-more-layer">
        <button className="phase15-admin-more-backdrop" type="button" onClick={() => setMoreOpen(false)} aria-label="Close admin menu" />
        <aside id="admin-more-menu" className="phase15-admin-more-sheet" role="dialog" aria-modal="true" aria-label="More admin pages">
          <div className="phase15-admin-more-head"><div><small>RISEORA ADMIN</small><strong>More tools</strong></div><button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu"><Icon name="close" size={20} /></button></div>
          <div className="phase15-admin-more-grid">{mobileMore.map((item) => <NavLink key={item.to} to={item.to}><span><Icon name={item.icon} size={20} /></span><strong>{item.label}</strong><Icon name="arrow" size={16} /></NavLink>)}</div>
          <div className="phase15-admin-more-actions"><a href="/">View storefront</a><button type="button" onClick={logout}><Icon name="logout" size={17} /> Logout</button></div>
        </aside>
      </div>}
    </div>
  );
}

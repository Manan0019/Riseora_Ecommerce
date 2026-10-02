import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icons";
import BrandLogo from "./BrandLogo";
import { adminHasPermission, ADMIN_ROLE_LABELS, normalizedAdminRole } from "../adminPermissions";

const nav = [
  { to: "/admin", label: "Dashboard", icon: "dashboard", end: true, permission: "DASHBOARD" },
  { to: "/admin/catalog", label: "Catalog", icon: "package", permission: "CATALOG" },
  { to: "/admin/reports", label: "Reports", icon: "sparkles", permission: "DASHBOARD" },
  { to: "/admin/inventory", label: "Inventory", icon: "tag", permission: "CATALOG" },
  { to: "/admin/orders", label: "Orders", icon: "orders", permission: "OPERATIONS" },
  { to: "/admin/payments", label: "Payments", icon: "shield", permission: "OPERATIONS" },
  { to: "/admin/customers", label: "Customers", icon: "user", permission: "CUSTOMERS" },
  { to: "/admin/support", label: "Support", icon: "mail", permission: "SUPPORT" },
  { to: "/admin/promotions", label: "Promotions", icon: "tag", permission: "MARKETING" },
  { to: "/admin/merchandising", label: "Merchandising", icon: "sparkles", permission: "MARKETING" },
  { to: "/admin/reviews", label: "Reviews", icon: "star", permission: "CONTENT" },
  { to: "/admin/returns", label: "Returns", icon: "truck", permission: "OPERATIONS" },
  { to: "/admin/cancellations", label: "Cancellations", icon: "close", permission: "OPERATIONS" },
  { to: "/admin/audience", label: "Audience", icon: "mail", permission: "MARKETING" },
  { to: "/admin/retention", label: "Retention", icon: "bell", permission: "MARKETING" },
  { to: "/admin/rewards", label: "Rewards", icon: "star", permission: "MARKETING" },
  { to: "/admin/lifecycle", label: "Lifecycle", icon: "refresh", permission: "MARKETING" },
  { to: "/admin/growth", label: "Growth", icon: "sparkles", permission: "MARKETING" },
  { to: "/admin/settings", label: "Settings", icon: "shield", permission: "SETTINGS" },
  { to: "/admin/erp-sync", label: "ERP Sync", icon: "refresh", permission: "ERP" },
  { to: "/admin/security", label: "Security", icon: "shield", permission: "SECURITY" },
  { to: "/admin/system", label: "System", icon: "dashboard", permission: "SYSTEM" },
];
const mobilePrimaryPaths = new Set(["/admin", "/admin/orders", "/admin/catalog", "/admin/inventory"]);

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const adminRole = normalizedAdminRole(user?.adminRole);
  const visibleNav = nav.filter((item) => adminHasPermission(adminRole, item.permission));
  const mobilePrimary = visibleNav.filter((item) => mobilePrimaryPaths.has(item.to));
  const mobileMore = visibleNav.filter((item) => !mobilePrimaryPaths.has(item.to));
  const moreActive = useMemo(() => mobileMore.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)), [pathname]);
  const activeNav = useMemo(() => visibleNav.find((item) => pathname === item.to || (item.to !== "/admin" && pathname.startsWith(`${item.to}/`))) || visibleNav[0], [pathname, visibleNav]);

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
        <div className="phase34-admin-nav-label">WORKSPACE</div>
        <nav className="admin-nav" aria-label="Admin workspace">
          {visibleNav.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><Icon name={item.icon} size={20} /><span>{item.label}</span></NavLink>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" className="admin-store-link">View storefront →</a>
          <button onClick={logout}><Icon name="logout" size={18} /> Logout</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar phase15-admin-topbar">
          <div><span className="admin-mobile-brand">RISEORA ADMIN</span><strong>{user?.firstName ? `Hi, ${user.firstName}` : "Store admin"}</strong><small className="phase31-admin-role">{ADMIN_ROLE_LABELS[adminRole]}{activeNav?.label ? ` · ${activeNav.label}` : ""}</small></div>
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

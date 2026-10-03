import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { AnalyticsConsent } from "./AnalyticsBridge";
import MiniCartDrawer from "./MiniCartDrawer";
import CompareTray from "./CompareTray";
import MaintenancePage from "./MaintenancePage";
import NetworkStatus from "./NetworkStatus";
import { useStore } from "../context/StoreContext";

function RouteScrollManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function Layout() {
  const { pathname } = useLocation();
  const { store, loading } = useStore();
  const maintenanceBypass = pathname === "/help" || pathname === "/contact" || pathname === "/unsubscribe" || pathname.startsWith("/policies/");
  if (!loading && store.maintenanceActive && !maintenanceBypass) return <MaintenancePage />;
  return (
    <div className="app-shell phase15-app-shell">
      <RouteScrollManager />
      <NetworkStatus />
      <Header />
      <main className="main-content">
        <div key={pathname} className="phase18-route-frame"><Outlet /></div>
      </main>
      <Footer />
      <MobileBottomNav />
      <MiniCartDrawer />
      <CompareTray />
      <AnalyticsConsent />
    </div>
  );
}

import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { AnalyticsConsent } from "./AnalyticsBridge";
import MiniCartDrawer from "./MiniCartDrawer";

function RouteScrollManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export default function Layout() {
  return (
    <div className="app-shell phase15-app-shell">
      <RouteScrollManager />
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
      <MiniCartDrawer />
      <AnalyticsConsent />
    </div>
  );
}

import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";
import MobileBottomNav from "./MobileBottomNav";
import { AnalyticsConsent } from "./AnalyticsBridge";
import MiniCartDrawer from "./MiniCartDrawer";

export default function Layout() {
  return (
    <div className="app-shell">
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

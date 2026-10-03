import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { reportClientError } from "./api/http";
import { cleanupDevelopmentServiceWorkers, prepareClientRuntime } from "./lib/client-runtime";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CompareProvider } from "./context/CompareContext";
import { StoreProvider } from "./context/StoreContext";
import { NotificationProvider } from "./context/NotificationContext";
import "./styles.css";

prepareClientRuntime();

window.addEventListener("error", (event) => {
  reportClientError({ message: event.error?.message || event.message || "Unhandled browser error", route: window.location.pathname, source: "window-error" });
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportClientError({ message: reason?.message || String(reason || "Unhandled promise rejection"), route: window.location.pathname, source: "unhandled-rejection" });
});

async function boot() {
  const reloadingAfterDevCacheRepair = await cleanupDevelopmentServiceWorkers();
  if (reloadingAfterDevCacheRepair) return;

  ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><AppErrorBoundary><BrowserRouter><StoreProvider><AuthProvider><NotificationProvider><CartProvider><WishlistProvider><CompareProvider><App /></CompareProvider></WishlistProvider></CartProvider></NotificationProvider></AuthProvider></StoreProvider></BrowserRouter></AppErrorBoundary></React.StrictMode>);

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

void boot();

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { StoreProvider } from "./context/StoreContext";
import { NotificationProvider } from "./context/NotificationContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><StoreProvider><AuthProvider><NotificationProvider><CartProvider><WishlistProvider><App /></WishlistProvider></CartProvider></NotificationProvider></AuthProvider></StoreProvider></BrowserRouter></React.StrictMode>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

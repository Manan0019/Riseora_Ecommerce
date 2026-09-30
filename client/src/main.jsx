import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { StoreProvider } from "./context/StoreContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><BrowserRouter><StoreProvider><AuthProvider><CartProvider><WishlistProvider><App /></WishlistProvider></CartProvider></AuthProvider></StoreProvider></BrowserRouter></React.StrictMode>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

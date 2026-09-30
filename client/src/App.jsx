import { Route, Routes } from "react-router-dom";
import AdminLayout from "./components/AdminLayout";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Account from "./pages/Account";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Offers from "./pages/Offers";
import OrderSuccess from "./pages/OrderSuccess";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import TrackOrder from "./pages/TrackOrder";
import ProductDetails from "./pages/ProductDetails";
import Register from "./pages/Register";
import Shop from "./pages/Shop";
import Wishlist from "./pages/Wishlist";
import Returns from "./pages/Returns";
import ReturnRequest from "./pages/ReturnRequest";
import Invoice from "./pages/Invoice";
import Policy from "./pages/Policy";
import AdminCatalog from "./pages/admin/AdminCatalog";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminInventory from "./pages/admin/AdminInventory";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminOrderDetail from "./pages/admin/AdminOrderDetail";
import AdminPromotions from "./pages/admin/AdminPromotions";
import AdminReturns from "./pages/admin/AdminReturns";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminInvoice from "./pages/admin/AdminInvoice";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/product/:slug" element={<ProductDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/order-success/:orderNumber" element={<OrderSuccess />} />
        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/orders/:orderNumber" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
        <Route path="/returns/new/:orderNumber" element={<ProtectedRoute><ReturnRequest /></ProtectedRoute>} />
        <Route path="/invoice/:orderNumber" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />
        <Route path="/policies/:type" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute admin><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="catalog" element={<AdminCatalog />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="orders/:id" element={<AdminOrderDetail />} />
        <Route path="promotions" element={<AdminPromotions />} />
        <Route path="returns" element={<AdminReturns />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="orders/:id/invoice" element={<AdminInvoice />} />
      </Route>
    </Routes>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";

function money(value) { return Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }); }
function etaText(order) {
  const estimate = order?.deliveryEstimate;
  if (!estimate) return "We'll show your delivery estimate as fulfilment starts.";
  const min = Number(estimate.dispatchWithinDays || 0) + Number(estimate.deliveryMinDays || 0);
  const max = Number(estimate.dispatchWithinDays || 0) + Number(estimate.deliveryMaxDays || 0);
  const a = new Date(); a.setDate(a.getDate() + min); const b = new Date(); b.setDate(b.getDate() + max);
  return `${a.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}–${b.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const { state } = useLocation();
  const { user } = useAuth();
  const [order, setOrder] = useState(state?.order || null);

  useEffect(() => { if (!user || order?.items?.length) return; apiFetch(`/orders/my/${orderNumber}`).then((r) => setOrder(r.data)).catch(() => {}); }, [user, orderNumber]);

  const online = order?.paymentMethod === "ONLINE";
  return <div className="container page-space phase33-success-wrap"><div className="success-card phase33-success-card"><div className="success-icon">✓</div><p className="eyebrow">{state?.recoveredPayment ? "PAYMENT RECOVERED" : "ORDER CONFIRMED"}</p><h1>Thank you for your order</h1><p>Your order number is <strong>{orderNumber}</strong>.</p>
    <div className="phase33-success-grid"><div><span><Icon name="shield" size={18} /></span><small>PAYMENT</small><strong>{online ? "Paid securely online" : "Cash on Delivery"}</strong></div><div><span><Icon name="orders" size={18} /></span><small>ORDER TOTAL</small><strong>{order ? money(order.totalAmount) : "Confirmed"}</strong></div><div><span><Icon name="truck" size={18} /></span><small>DELIVERY</small><strong>{etaText(order)}</strong></div></div>
    <div className="phase33-next-steps"><h2>What happens next?</h2><div><b>1</b><p><strong>Order review</strong><span>Riseora verifies stock, address and fulfilment details.</span></p></div><div><b>2</b><p><strong>Packed & shipped</strong><span>Tracking and courier updates appear in your order journey.</span></p></div><div><b>3</b><p><strong>Delivery</strong><span>{online ? "No payment is due at delivery." : "Pay the delivery partner when the order arrives."}</span></p></div></div>
    <div className="hero-actions"><Link className="button" to={user ? `/orders/${orderNumber}` : "/track-order"}>{user ? "View order journey" : "Track order"}</Link><Link className="button button-secondary" to="/shop">Continue shopping</Link>{user && <Link className="button button-secondary" to="/orders">My orders</Link>}</div>
    {!user && <p className="phase33-guest-note">Save your order number and phone number. You can track this guest order anytime from Track Order.</p>}
  </div></div>;
}

import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "",
    customerEmail: user?.email || "",
    customerPhone: user?.phone || "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "Gujarat",
    postalCode: "",
  });

  if (items.length === 0) return <Navigate to="/cart" replace />;

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          paymentMethod: "COD",
          shippingAddress: {
            line1: form.line1,
            line2: form.line2,
            landmark: form.landmark,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: "India",
          },
          items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      clearCart();
      navigate(`/order-success/${response.data.orderNumber}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container page-space">
      <h1>Checkout</h1>
      <div className="checkout-layout">
        <form className="form-card" onSubmit={submit}>
          <h2>Delivery details</h2>
          {error && <p className="alert error">{error}</p>}
          <div className="form-grid two"><label>Full name<input required name="customerName" value={form.customerName} onChange={update} /></label><label>Phone<input required name="customerPhone" value={form.customerPhone} onChange={update} /></label></div>
          <label>Email<input type="email" name="customerEmail" value={form.customerEmail} onChange={update} /></label>
          <label>Address<input required name="line1" value={form.line1} onChange={update} /></label>
          <label>Address line 2<input name="line2" value={form.line2} onChange={update} /></label>
          <label>Landmark<input name="landmark" value={form.landmark} onChange={update} /></label>
          <div className="form-grid three"><label>City<input required name="city" value={form.city} onChange={update} /></label><label>State<input required name="state" value={form.state} onChange={update} /></label><label>PIN code<input required name="postalCode" value={form.postalCode} onChange={update} /></label></div>
          <div className="payment-box"><strong>Payment method</strong><p>Cash on Delivery (COD)</p><small>Online payment integration will be added when the real payment provider is selected.</small></div>
          <button className="button wide" disabled={submitting}>{submitting ? "Placing order..." : "Place order"}</button>
        </form>
        <aside className="summary-card"><h2>Order summary</h2>{items.map((item) => <div className="summary-row" key={item.variantId}><span>{item.productName} × {item.quantity}</span><strong>₹{(item.price * item.quantity).toFixed(0)}</strong></div>)}<hr /><div className="summary-row total"><span>Total</span><strong>₹{subtotal.toFixed(0)}</strong></div></aside>
      </div>
    </div>
  );
}

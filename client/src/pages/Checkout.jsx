import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState("");
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

  useEffect(() => {
    setAppliedCoupon("");
    setDiscountAmount(0);
    setCouponMessage("");
  }, [subtotal]);

  if (items.length === 0) return <Navigate to="/cart" replace />;

  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError(""); setCouponMessage("");
    try {
      const response = await apiFetch("/promotions/coupons/validate", { method: "POST", body: JSON.stringify({ code, subtotal }) });
      setAppliedCoupon(response.data.code);
      setDiscountAmount(Number(response.data.discountAmount));
      setCouponMessage(`Coupon ${response.data.code} applied.`);
    } catch (err) {
      setAppliedCoupon(""); setDiscountAmount(0); setCouponError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const response = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          couponCode: appliedCoupon || "",
          paymentMethod: "COD",
          shippingAddress: { line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India" },
          items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        }),
      });
      clearCart(); navigate(`/order-success/${response.data.orderNumber}`, { replace: true });
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  }

  const total = Math.max(0, subtotal - discountAmount);

  return (
    <div className="container page-space checkout-page">
      <div className="checkout-heading"><p className="eyebrow">SECURE CHECKOUT</p><h1>Complete your order</h1></div>
      <div className="checkout-layout">
        <form className="form-card checkout-form" onSubmit={submit}>
          <div className="form-section-title"><span>1</span><div><h2>Contact details</h2><p>We'll use these details for your order.</p></div></div>
          {error && <p className="alert error">{error}</p>}
          <div className="form-grid two"><label>Full name<input required name="customerName" value={form.customerName} onChange={update} autoComplete="name" /></label><label>Phone<input required name="customerPhone" value={form.customerPhone} onChange={update} inputMode="tel" autoComplete="tel" /></label></div>
          <label>Email<input type="email" name="customerEmail" value={form.customerEmail} onChange={update} autoComplete="email" /></label>

          <div className="form-section-title form-section-gap"><span>2</span><div><h2>Delivery address</h2><p>Where should we send your order?</p></div></div>
          <label>Address<input required name="line1" value={form.line1} onChange={update} autoComplete="address-line1" /></label>
          <label>Address line 2<input name="line2" value={form.line2} onChange={update} autoComplete="address-line2" /></label>
          <label>Landmark<input name="landmark" value={form.landmark} onChange={update} /></label>
          <div className="form-grid three"><label>City<input required name="city" value={form.city} onChange={update} autoComplete="address-level2" /></label><label>State<input required name="state" value={form.state} onChange={update} autoComplete="address-level1" /></label><label>PIN code<input required name="postalCode" value={form.postalCode} onChange={update} inputMode="numeric" autoComplete="postal-code" /></label></div>

          <div className="form-section-title form-section-gap"><span>3</span><div><h2>Payment</h2><p>More payment options can be added later.</p></div></div>
          <div className="payment-box selected"><span><Icon name="shield" size={20} /></span><div><strong>Cash on Delivery (COD)</strong><p>Pay when your order arrives.</p></div><b>✓</b></div>
          <button className="button wide checkout-submit" disabled={submitting}>{submitting ? "Placing order…" : `Place order • ₹${total.toFixed(0)}`}</button>
        </form>

        <aside className="summary-card checkout-summary">
          <h2>Order summary</h2>
          <div className="checkout-items">{items.map((item) => <div className="checkout-item" key={item.variantId}><div className="checkout-item-image">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : "R"}<b>{item.quantity}</b></div><div><strong>{item.productName}</strong><span>{item.variantName}</span></div><strong>₹{(item.price * item.quantity).toFixed(0)}</strong></div>)}</div>
          <div className="coupon-box"><label>Coupon code</label><div><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div>{couponMessage && <small className="coupon-success">{couponMessage}</small>}{couponError && <small className="coupon-error">{couponError}</small>}</div>
          <div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div>
          {discountAmount > 0 && <div className="summary-row discount-row"><span>Coupon {appliedCoupon}</span><strong>−₹{discountAmount.toFixed(0)}</strong></div>}
          <div className="summary-row"><span>Shipping</span><span>₹0</span></div>
          <div className="summary-row total"><span>Total</span><strong>₹{total.toFixed(0)}</strong></div>
        </aside>
      </div>
    </div>
  );
}

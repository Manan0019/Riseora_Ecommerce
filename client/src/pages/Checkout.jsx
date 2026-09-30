import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";

let razorpayScriptPromise;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

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
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [onlinePaymentsEnabled, setOnlinePaymentsEnabled] = useState(false);
  const [storeConfig, setStoreConfig] = useState({ freeShippingThreshold: null, flatShippingFee: 0, codFee: 0 });
  const [form, setForm] = useState({
    customerName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "",
    customerEmail: user?.email || "",
    customerPhone: user?.phone || "",
    line1: "", line2: "", landmark: "", city: "", state: "Gujarat", postalCode: "",
  });

  useEffect(() => { setAppliedCoupon(""); setDiscountAmount(0); setCouponMessage(""); }, [subtotal]);

  useEffect(() => {
    apiFetch("/payments/config").then((response) => setOnlinePaymentsEnabled(Boolean(response.data.onlinePaymentsEnabled))).catch(() => setOnlinePaymentsEnabled(false));
    apiFetch("/store/config").then((response) => setStoreConfig(response.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    apiFetch("/account/addresses").then((response) => {
      setSavedAddresses(response.data);
      const preferred = response.data.find((item) => item.isDefault) || response.data[0];
      if (preferred) selectSavedAddress(preferred);
    }).catch(() => {});
  }, [user]);

  function selectSavedAddress(item) {
    setSelectedAddressId(item.id);
    setForm((current) => ({ ...current, customerName: item.name || current.customerName, customerPhone: item.phone || current.customerPhone, line1: item.line1 || "", line2: item.line2 || "", landmark: item.landmark || "", city: item.city || "", state: item.state || "", postalCode: item.postalCode || "" }));
  }

  if (items.length === 0) return <Navigate to="/cart" replace />;

  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError(""); setCouponMessage("");
    try {
      const response = await apiFetch("/promotions/coupons/validate", { method: "POST", body: JSON.stringify({ code, subtotal }) });
      setAppliedCoupon(response.data.code); setDiscountAmount(Number(response.data.discountAmount)); setCouponMessage(`Coupon ${response.data.code} applied.`);
    } catch (err) { setAppliedCoupon(""); setDiscountAmount(0); setCouponError(err.message); }
  }

  function checkoutPayload() {
    return {
      customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, couponCode: appliedCoupon || "",
      shippingAddress: { line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India" },
      items: items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    };
  }

  async function payOnline() {
    const scriptReady = await loadRazorpayScript();
    if (!scriptReady || !window.Razorpay) throw new Error("Secure payment window could not be loaded. Please try again or use COD.");
    const sessionResponse = await apiFetch("/payments/razorpay/session", { method: "POST", body: JSON.stringify(checkoutPayload()) });
    const session = sessionResponse.data;

    return new Promise((resolve, reject) => {
      const checkout = new window.Razorpay({
        key: session.keyId,
        amount: session.amountPaise,
        currency: session.currency,
        name: "Riseora Herbals",
        description: "Riseora online order",
        order_id: session.providerOrderId,
        prefill: { name: session.customer.name || "", email: session.customer.email || "", contact: session.customer.phone || "" },
        theme: { color: "#173326" },
        handler: async (paymentResponse) => {
          try {
            const verified = await apiFetch("/payments/razorpay/verify", {
              method: "POST",
              body: JSON.stringify({ sessionId: session.sessionId, ...paymentResponse }),
            });
            resolve(verified.data);
          } catch (verifyError) { reject(verifyError); }
        },
        modal: {
          ondismiss: () => {
            apiFetch("/payments/razorpay/cancel", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId }) }).catch(() => {});
            reject(new Error("Payment was cancelled. Your cart is still here."));
          },
        },
      });
      checkout.on("payment.failed", (response) => reject(new Error(response?.error?.description || "Payment failed. Please try again.")));
      checkout.open();
    });
  }

  async function submit(event) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      let order;
      if (paymentMethod === "ONLINE") {
        order = await payOnline();
      } else {
        const response = await apiFetch("/orders", { method: "POST", body: JSON.stringify({ ...checkoutPayload(), paymentMethod: "COD" }) });
        order = response.data;
      }
      clearCart();
      navigate(`/order-success/${order.orderNumber}`, { replace: true });
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  }

  const merchandiseAfterDiscount = Math.max(0, subtotal - discountAmount);
  const threshold = storeConfig.freeShippingThreshold == null ? null : Number(storeConfig.freeShippingThreshold);
  const baseShipping = threshold !== null && merchandiseAfterDiscount >= threshold ? 0 : Number(storeConfig.flatShippingFee || 0);
  const codFee = paymentMethod === "COD" ? Number(storeConfig.codFee || 0) : 0;
  const shippingFee = baseShipping + codFee;
  const total = Math.max(0, merchandiseAfterDiscount + shippingFee);

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
          {savedAddresses.length > 0 && <div className="checkout-saved-addresses">{savedAddresses.map((item) => <button type="button" key={item.id} className={selectedAddressId === item.id ? "checkout-address-chip active" : "checkout-address-chip"} onClick={() => selectSavedAddress(item)}><span>{item.type}{item.isDefault ? " • DEFAULT" : ""}</span><strong>{item.name}</strong><small>{item.line1}, {item.city} {item.postalCode}</small></button>)}</div>}
          <label>Address<input required name="line1" value={form.line1} onChange={update} autoComplete="address-line1" /></label>
          <label>Address line 2<input name="line2" value={form.line2} onChange={update} autoComplete="address-line2" /></label>
          <label>Landmark<input name="landmark" value={form.landmark} onChange={update} /></label>
          <div className="form-grid three"><label>City<input required name="city" value={form.city} onChange={update} autoComplete="address-level2" /></label><label>State<input required name="state" value={form.state} onChange={update} autoComplete="address-level1" /></label><label>PIN code<input required name="postalCode" value={form.postalCode} onChange={update} inputMode="numeric" autoComplete="postal-code" /></label></div>

          <div className="form-section-title form-section-gap"><span>3</span><div><h2>Payment</h2><p>Choose how you want to pay.</p></div></div>
          <div className="payment-choice-grid">
            {onlinePaymentsEnabled && <button type="button" className={paymentMethod === "ONLINE" ? "payment-box selected" : "payment-box"} onClick={() => setPaymentMethod("ONLINE")}><span><Icon name="shield" size={20} /></span><div><strong>Pay online</strong><p>UPI, cards, netbanking & supported wallets.</p></div><b>{paymentMethod === "ONLINE" ? "✓" : ""}</b></button>}
            <button type="button" className={paymentMethod === "COD" ? "payment-box selected" : "payment-box"} onClick={() => setPaymentMethod("COD")}><span><Icon name="package" size={20} /></span><div><strong>Cash on Delivery</strong><p>Pay when your order arrives.</p></div><b>{paymentMethod === "COD" ? "✓" : ""}</b></button>
          </div>
          <button className="button wide checkout-submit" disabled={submitting}>{submitting ? (paymentMethod === "ONLINE" ? "Opening secure payment…" : "Placing order…") : `${paymentMethod === "ONLINE" ? "Pay securely" : "Place COD order"} • ₹${total.toFixed(0)}`}</button>
        </form>

        <aside className="summary-card checkout-summary">
          <h2>Order summary</h2>
          <div className="checkout-items">{items.map((item) => <div className="checkout-item" key={item.variantId}><div className="checkout-item-image">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : "R"}<b>{item.quantity}</b></div><div><strong>{item.productName}</strong><span>{item.variantName}</span></div><strong>₹{(item.price * item.quantity).toFixed(0)}</strong></div>)}</div>
          <div className="coupon-box"><label>Coupon code</label><div><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div>{couponMessage && <small className="coupon-success">{couponMessage}</small>}{couponError && <small className="coupon-error">{couponError}</small>}</div>
          <div className="summary-row"><span>Subtotal</span><strong>₹{subtotal.toFixed(0)}</strong></div>
          {discountAmount > 0 && <div className="summary-row discount-row"><span>Coupon {appliedCoupon}</span><strong>−₹{discountAmount.toFixed(0)}</strong></div>}
          <div className="summary-row"><span>Shipping{codFee > 0 ? " + COD fee" : ""}</span><span>{shippingFee > 0 ? `₹${shippingFee.toFixed(0)}` : "FREE"}</span></div>
          <div className="summary-row total"><span>Total</span><strong>₹{total.toFixed(0)}</strong></div>
        </aside>
      </div>
    </div>
  );
}

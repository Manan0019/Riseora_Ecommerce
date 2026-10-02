import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, mediaUrl } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Icon } from "../components/Icons";
import { trackCommerce, trackPurchase } from "../analytics";

const RECOVERY_KEY = "riseora_cart_recovery_token";
const BUY_NOW_RECOVERY_KEY = "riseora_buy_now_recovery_token";
const ONLINE_SESSION_KEY = "riseora_online_payment_session";
const REQUEST_KEY = "riseora_checkout_request";

function readSavedPin() { try { const value = localStorage.getItem("riseora_delivery_pin") || ""; return /^\d{6}$/.test(value) ? value : ""; } catch { return ""; } }
function formatEta(days) { const date = new Date(); date.setDate(date.getDate() + Math.max(0, Number(days || 0))); return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
function makeUuid() { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16); }); }
function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function removeLocal(key) { try { localStorage.removeItem(key); } catch {} }

let razorpayScriptPromise;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayScriptPromise) razorpayScriptPromise = new Promise((resolve) => { const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; script.onload = () => resolve(true); script.onerror = () => resolve(false); document.body.appendChild(script); });
  return razorpayScriptPromise;
}

export default function Checkout() {
  const { items, subtotal, clearCart, buyNowItems, buyNowSubtotal, clearBuyNow } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const buyNowMode = searchParams.get("mode") === "buy-now";
  const checkoutItems = buyNowMode ? buyNowItems : items;
  const checkoutSubtotal = buyNowMode ? buyNowSubtotal : subtotal;
  const activeRecoveryKey = buyNowMode ? BUY_NOW_RECOVERY_KEY : RECOVERY_KEY;
  const signature = useMemo(() => `${buyNowMode ? "buy" : "cart"}:${checkoutItems.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|")}`, [buyNowMode, checkoutItems]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [saveAddress, setSaveAddress] = useState(Boolean(user));
  const [addressType, setAddressType] = useState("HOME");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [onlinePaymentsEnabled, setOnlinePaymentsEnabled] = useState(false);
  const [paymentRecovery, setPaymentRecovery] = useState(null);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [codEligibility, setCodEligibility] = useState({ eligible: true, reasons: [], openCodOrders: 0, openCodOrderLimit: null, prepaidOnlyProducts: [] });
  const [recoveryOptIn, setRecoveryOptIn] = useState(false);
  const [storeConfig, setStoreConfig] = useState({ freeShippingThreshold: null, flatShippingFee: 0, codFee: 0, codEnabled: true, codMinOrderAmount: null, codMaxOrderAmount: null, maxOpenCodOrdersPerCustomer: null, dispatchWithinDays: 2, deliveryMinDays: 3, deliveryMaxDays: 7, returnsEnabled: true, returnWindowDays: 7 });
  const [pricing, setPricing] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryChecking, setDeliveryChecking] = useState(false);
  const beginCheckoutSignature = useRef("");
  const [form, setForm] = useState({ customerName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "", customerEmail: user?.email || "", customerPhone: user?.phone || "", line1: "", line2: "", landmark: "", city: "", state: "Gujarat", postalCode: readSavedPin() });

  function requestKey() {
    const current = readJson(REQUEST_KEY);
    if (current?.signature === signature && current?.key) return current.key;
    const key = makeUuid(); writeJson(REQUEST_KEY, { signature, key }); return key;
  }
  function rotateRequestKey() { const key = makeUuid(); writeJson(REQUEST_KEY, { signature, key }); return key; }
  function clearPaymentLocal() { removeLocal(ONLINE_SESSION_KEY); setPaymentRecovery(null); }

  useEffect(() => { setAppliedCoupon(""); setDiscountAmount(0); setCouponMessage(""); }, [checkoutSubtotal]);
  useEffect(() => { if (!checkoutItems.length || beginCheckoutSignature.current === signature) return; beginCheckoutSignature.current = signature; trackCommerce("begin_checkout", { items: checkoutItems, value: checkoutSubtotal, checkout_mode: buyNowMode ? "buy_now" : "cart" }); }, [checkoutItems, checkoutSubtotal, buyNowMode, signature]);
  useEffect(() => { apiFetch("/payments/config").then((r) => setOnlinePaymentsEnabled(Boolean(r.data.onlinePaymentsEnabled))).catch(() => setOnlinePaymentsEnabled(false)); apiFetch("/store/config").then((r) => setStoreConfig(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!onlinePaymentsEnabled || !checkoutItems.length) return;
    const stored = readJson(ONLINE_SESSION_KEY);
    if (!stored?.sessionId || stored.signature !== signature) return;
    let cancelled = false;
    setPaymentChecking(true);
    apiFetch(`/payments/razorpay/session/${stored.sessionId}/status`).then((response) => {
      if (cancelled) return;
      const status = response.data;
      if (status.status === "PAID" && status.orderNumber) return finishRecoveredOrder(status);
      if (status.status === "PENDING") setPaymentRecovery(status);
      else clearPaymentLocal();
    }).catch(() => clearPaymentLocal()).finally(() => { if (!cancelled) setPaymentChecking(false); });
    return () => { cancelled = true; };
  }, [onlinePaymentsEnabled, signature, checkoutItems.length]);

  useEffect(() => {
    const pin = String(form.postalCode || "").replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(pin)) { setDeliveryQuote(null); setDeliveryChecking(false); return; }
    let cancelled = false; setDeliveryChecking(true);
    const timer = setTimeout(() => apiFetch(`/store/serviceability?postalCode=${encodeURIComponent(pin)}&subtotal=${encodeURIComponent(checkoutSubtotal)}&paymentMethod=${paymentMethod}`).then((response) => {
      if (cancelled) return; const quote = response.data; setDeliveryQuote(quote);
      if (quote?.matched && (quote.city || quote.state)) setForm((current) => ({ ...current, city: current.city.trim() ? current.city : (quote.city || current.city), state: (!current.state.trim() || current.state === "Gujarat") && quote.state ? quote.state : current.state }));
      try { localStorage.setItem("riseora_delivery_pin", pin); } catch {}
    }).catch((err) => { if (!cancelled) setDeliveryQuote({ serviceable: false, matched: false, reason: err.message || "Delivery availability could not be checked." }); }).finally(() => { if (!cancelled) setDeliveryChecking(false); }), 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.postalCode, checkoutSubtotal, paymentMethod]);

  useEffect(() => { if (!user) return; apiFetch("/account/addresses").then((response) => { setSavedAddresses(response.data); const preferred = response.data.find((item) => item.isDefault) || response.data[0]; if (preferred) selectSavedAddress(preferred); }).catch(() => {}); }, [user]);
  useEffect(() => {
    const email = form.customerEmail.trim(); if (!checkoutItems.length || !/^\S+@\S+\.\S+$/.test(email)) return;
    const timer = setTimeout(() => { let cartToken; try { cartToken = localStorage.getItem(activeRecoveryKey) || undefined; } catch { cartToken = undefined; } apiFetch("/cart-recovery", { method: "POST", body: JSON.stringify({ ...(cartToken ? { cartToken } : {}), email, name: form.customerName, phone: form.customerPhone, subtotal: checkoutSubtotal, recoveryOptIn, items: checkoutItems.map((item) => ({ variantId: item.variantId, productName: item.productName, variantName: item.variantName || "", sku: item.sku, quantity: item.quantity, price: Number(item.price), imageUrl: item.imageUrl || "" })) }) }).then((response) => { try { localStorage.setItem(activeRecoveryKey, response.data.cartToken); } catch {} }).catch(() => {}); }, 1200);
    return () => clearTimeout(timer);
  }, [form.customerEmail, form.customerName, form.customerPhone, checkoutItems, checkoutSubtotal, recoveryOptIn, activeRecoveryKey]);

  useEffect(() => {
    if (!checkoutItems.length) return; let cancelled = false;
    const timer = setTimeout(() => apiFetch("/orders/cod-eligibility", { method: "POST", body: JSON.stringify({ customerEmail: /^\S+@\S+\.\S+$/.test(form.customerEmail.trim()) ? form.customerEmail.trim() : "", customerPhone: form.customerPhone.trim().length >= 8 ? form.customerPhone.trim() : "", postalCode: /^\d{6}$/.test(form.postalCode) ? form.postalCode : "", items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }) }).then((response) => { if (cancelled) return; setCodEligibility(response.data); if (!response.data.eligible && onlinePaymentsEnabled) setPaymentMethod("ONLINE"); }).catch(() => { if (!cancelled) setCodEligibility({ eligible: false, reasons: ["COD availability could not be verified right now."], openCodOrders: 0, openCodOrderLimit: null, prepaidOnlyProducts: [] }); }), 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [checkoutItems, form.customerEmail, form.customerPhone, form.postalCode, onlinePaymentsEnabled]);

  useEffect(() => {
    if (!checkoutItems.length) { setPricing(null); return; } let cancelled = false;
    const timer = setTimeout(() => apiFetch("/promotions/cart-preview", { method: "POST", body: JSON.stringify({ paymentMethod, couponCode: appliedCoupon || "", customerEmail: form.customerEmail || "", customerPhone: form.customerPhone || "", postalCode: /^\d{6}$/.test(form.postalCode) ? form.postalCode : "", items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }) }).then((response) => { if (!cancelled) setPricing(response.data); }).catch(() => { if (!cancelled) setPricing(null); }), 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [checkoutItems, paymentMethod, appliedCoupon, form.customerEmail, form.customerPhone, form.postalCode]);

  function selectSavedAddress(item) { setSelectedAddressId(item.id); setSaveAddress(false); setForm((current) => ({ ...current, customerName: item.name || current.customerName, customerPhone: item.phone || current.customerPhone, line1: item.line1 || "", line2: item.line2 || "", landmark: item.landmark || "", city: item.city || "", state: item.state || "", postalCode: String(item.postalCode || "").replace(/\D/g, "").slice(0, 6) })); }
  function update(event) { setSelectedAddressId(""); setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  if (checkoutItems.length === 0) return <Navigate to={buyNowMode ? "/shop" : "/cart"} replace />;

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase(); if (!code) return; setCouponError(""); setCouponMessage("");
    try { const response = await apiFetch("/promotions/cart-preview", { method: "POST", body: JSON.stringify({ couponCode: code, paymentMethod, customerEmail: form.customerEmail || "", customerPhone: form.customerPhone || "", postalCode: /^\d{6}$/.test(form.postalCode) ? form.postalCode : "", items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }) }); setAppliedCoupon(code); setDiscountAmount(Number(response.data.couponDiscountAmount || 0)); setPricing(response.data); setCouponMessage(`Coupon ${code} applied.`); } catch (err) { setAppliedCoupon(""); setDiscountAmount(0); setCouponError(err.message); }
  }

  function checkoutPayload() { return { checkoutRequestKey: requestKey(), customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, couponCode: appliedCoupon || "", shippingAddress: { line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India" }, items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }; }

  async function persistAddress() {
    if (!user || !saveAddress || selectedAddressId) return;
    try { const response = await apiFetch("/account/addresses/from-checkout", { method: "POST", body: JSON.stringify({ name: form.customerName, phone: form.customerPhone, line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India", type: addressType, isDefault: saveAsDefault }) }); setSavedAddresses((current) => response.data ? [response.data, ...current.filter((item) => item.id !== response.data.id)] : current); } catch { /* an order must never fail because address saving failed */ }
  }

  async function markPaymentEvent(sessionId, event, message = "") { try { await apiFetch(`/payments/razorpay/session/${sessionId}/event`, { method: "POST", body: JSON.stringify({ event, message }) }); } catch {} }

  function openRazorpay(session) {
    return new Promise(async (resolve, reject) => {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) return reject(new Error("Secure payment window could not be loaded. Please try again or use COD."));
      await markPaymentEvent(session.sessionId, paymentRecovery ? "RETRY" : "OPENED");
      const checkout = new window.Razorpay({
        key: session.keyId, amount: session.amountPaise, currency: session.currency, name: "Riseora Herbals", description: "Riseora online order", order_id: session.providerOrderId,
        prefill: { name: form.customerName || session.customer?.name || "", email: form.customerEmail || session.customer?.email || "", contact: form.customerPhone || session.customer?.phone || "" }, theme: { color: "#173326" },
        handler: async (paymentResponse) => { try { const verified = await apiFetch("/payments/razorpay/verify", { method: "POST", body: JSON.stringify({ sessionId: session.sessionId, ...paymentResponse }) }); resolve(verified.data); } catch (verifyError) { reject(verifyError); } },
        modal: { ondismiss: () => { markPaymentEvent(session.sessionId, "DISMISSED"); const err = new Error("Payment window closed. Your reserved checkout is still available to retry for a short time."); err.recoverablePayment = true; reject(err); } },
      });
      checkout.on("payment.failed", (response) => { const message = response?.error?.description || "Payment attempt failed. You can retry without rebuilding your cart."; markPaymentEvent(session.sessionId, "FAILED", message); const err = new Error(message); err.recoverablePayment = true; reject(err); });
      checkout.open();
    });
  }

  async function payOnline() {
    const response = await apiFetch("/payments/razorpay/session", { method: "POST", body: JSON.stringify(checkoutPayload()) });
    const session = response.data;
    if (session.status === "PAID" && session.orderNumber) return session.order || { orderNumber: session.orderNumber, totalAmount: session.amountPaise / 100, paymentMethod: "ONLINE" };
    writeJson(ONLINE_SESSION_KEY, { sessionId: session.sessionId, signature }); setPaymentRecovery(session);
    return openRazorpay(session);
  }

  async function checkPaymentStatus({ silent = false } = {}) {
    const active = paymentRecovery || (() => { const local = readJson(ONLINE_SESSION_KEY); return local?.sessionId && local.signature === signature ? { sessionId: local.sessionId } : null; })();
    if (!active?.sessionId) return;
    setPaymentChecking(true); if (!silent) setError("");
    try { const response = await apiFetch(`/payments/razorpay/session/${active.sessionId}/status`); const status = response.data; if (status.status === "PAID" && status.orderNumber) return finishRecoveredOrder(status); if (status.status === "PENDING") setPaymentRecovery(status); else { clearPaymentLocal(); rotateRequestKey(); if (!silent) setError("The previous payment reservation is closed. You can start a new payment now."); } } catch (err) { if (!silent) setError(err.message); } finally { setPaymentChecking(false); }
  }

  async function retryPayment() {
    if (!paymentRecovery?.sessionId) return payOnline();
    setSubmitting(true); setError("");
    try { const response = await apiFetch(`/payments/razorpay/session/${paymentRecovery.sessionId}/status`); if (response.data.status === "PAID" && response.data.orderNumber) return finishRecoveredOrder(response.data); if (response.data.status !== "PENDING") { clearPaymentLocal(); rotateRequestKey(); throw new Error("This payment reservation is no longer active. Start payment again."); } const order = await openRazorpay(response.data); await completeOrder(order); } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  }

  async function cancelPaymentReservation() {
    if (!paymentRecovery?.sessionId) return;
    setPaymentChecking(true);
    try { const response = await apiFetch("/payments/razorpay/cancel", { method: "POST", body: JSON.stringify({ sessionId: paymentRecovery.sessionId }) }); if (response.data?.status === "PAID" && response.data?.orderNumber) return finishRecoveredOrder(response.data); clearPaymentLocal(); rotateRequestKey(); setError(""); } catch (err) { setError(err.message); } finally { setPaymentChecking(false); }
  }

  async function finishRecoveredOrder(status) {
    const order = status.order || { orderNumber: status.orderNumber, status: "CONFIRMED", paymentMethod: "ONLINE", totalAmount: Number(status.amountPaise || 0) / 100 };
    clearPaymentLocal(); await persistAddress(); if (buyNowMode) clearBuyNow(); else clearCart(); removeLocal(REQUEST_KEY); navigate(`/order-success/${order.orderNumber}`, { replace: true, state: { order, recoveredPayment: true } });
  }

  async function completeOrder(order) {
    try { const cartToken = localStorage.getItem(activeRecoveryKey); if (cartToken) { await apiFetch("/cart-recovery/converted", { method: "POST", body: JSON.stringify({ cartToken, orderNumber: order.orderNumber }) }); localStorage.removeItem(activeRecoveryKey); } } catch {}
    await persistAddress();
    trackPurchase({ transactionId: order.orderNumber, items: checkoutItems, value: Number(order.totalAmount ?? pricing?.totalAmount ?? checkoutSubtotal), coupon: appliedCoupon || undefined, payment_type: paymentMethod });
    clearPaymentLocal(); removeLocal(REQUEST_KEY); if (buyNowMode) clearBuyNow(); else clearCart(); navigate(`/order-success/${order.orderNumber}`, { replace: true, state: { order } });
  }

  async function submit(event) {
    event.preventDefault(); setSubmitting(true); setError("");
    try { await persistAddress(); let order; if (paymentMethod === "ONLINE") order = await payOnline(); else { const response = await apiFetch("/orders", { method: "POST", body: JSON.stringify({ ...checkoutPayload(), paymentMethod: "COD" }) }); order = response.data; } await completeOrder(order); }
    catch (err) { if (err?.recoverablePayment) { const stored = readJson(ONLINE_SESSION_KEY); if (stored?.sessionId) checkPaymentStatus({ silent: true }); } setError(err.message); }
    finally { setSubmitting(false); }
  }

  const displaySubtotal = Number(pricing?.subtotal ?? checkoutSubtotal); const automaticDiscountAmount = Number(pricing?.automaticDiscountAmount || 0); const couponDiscountAmount = Number(pricing?.couponDiscountAmount ?? discountAmount); const merchandiseAfterDiscount = Math.max(0, displaySubtotal - automaticDiscountAmount - couponDiscountAmount); const threshold = storeConfig.freeShippingThreshold == null ? null : Number(storeConfig.freeShippingThreshold); const baseShipping = threshold !== null && merchandiseAfterDiscount >= threshold ? 0 : Number(storeConfig.flatShippingFee || 0); const codFee = paymentMethod === "COD" ? Number(storeConfig.codFee || 0) : 0; const shippingFee = pricing ? Number(pricing.shippingFee || 0) : baseShipping + codFee; const total = pricing ? Number(pricing.totalAmount || 0) : Math.max(0, merchandiseAfterDiscount + shippingFee); const freeItems = pricing?.freeItems || []; const effectiveDelivery = pricing?.delivery || deliveryQuote; const dispatchDays = Math.max(0, Number(effectiveDelivery?.dispatchWithinDays ?? storeConfig.dispatchWithinDays ?? 2)); const deliveryMinDays = Math.max(1, Number(effectiveDelivery?.deliveryMinDays ?? storeConfig.deliveryMinDays ?? 3)); const deliveryMaxDays = Math.max(deliveryMinDays, Number(effectiveDelivery?.deliveryMaxDays ?? storeConfig.deliveryMaxDays ?? 7)); const estimatedFrom = formatEta(dispatchDays + deliveryMinDays); const estimatedTo = formatEta(dispatchDays + deliveryMaxDays); const postalCodeValid = /^\d{6}$/.test(form.postalCode); const deliveryBlocked = postalCodeValid && deliveryQuote?.serviceable === false; const checkoutDisabled = submitting || paymentChecking || !postalCodeValid || deliveryBlocked || (paymentMethod === "COD" && !codEligibility.eligible) || (!codEligibility.eligible && !onlinePaymentsEnabled);

  return <div className="container page-space checkout-page">
    <div className="checkout-heading"><p className="eyebrow">{buyNowMode ? "BUY NOW" : "SECURE CHECKOUT"}</p><h1>{buyNowMode ? "Fast checkout" : "Complete your order"}</h1>{buyNowMode && <p className="phase17-buy-now-note">This checkout contains only the product you selected with Buy Now. Your regular cart is unchanged.</p>}</div>
    {paymentRecovery?.status === "PENDING" && <div className="phase33-payment-recovery"><div><span className="phase33-recovery-icon"><Icon name="shield" size={21} /></span><div><strong>Online payment still available</strong><p>{paymentRecovery.lastPaymentStatus === "FAILED" ? (paymentRecovery.lastPaymentError || "The previous attempt failed.") : "Your stock is reserved temporarily. Retry the same secure payment or check whether a delayed confirmation arrived."}</p><small>Reservation expires {new Date(paymentRecovery.expiresAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.</small></div></div><div className="phase33-recovery-actions"><button type="button" className="button" onClick={retryPayment} disabled={submitting || paymentChecking}>Retry payment</button><button type="button" className="button button-secondary" onClick={() => checkPaymentStatus()} disabled={paymentChecking}>{paymentChecking ? "Checking…" : "Check status"}</button><button type="button" className="phase33-link-button" onClick={cancelPaymentReservation} disabled={paymentChecking}>Cancel reservation</button></div></div>}
    <div className="checkout-layout">
      <form id="riseora-checkout-form" className="form-card checkout-form" onSubmit={submit}>
        <div className="form-section-title"><span>1</span><div><h2>Contact details</h2><p>We'll use these details for your order.</p></div></div>{error && <p className="alert error">{error}</p>}
        <div className="form-grid two"><label>Full name<input required name="customerName" value={form.customerName} onChange={update} autoComplete="name" /></label><label>Phone<input required name="customerPhone" value={form.customerPhone} onChange={update} inputMode="tel" autoComplete="tel" /></label></div><label>Email<input type="email" name="customerEmail" value={form.customerEmail} onChange={update} autoComplete="email" /></label>
        <label className="checkbox-row checkout-recovery-consent"><input type="checkbox" checked={recoveryOptIn} onChange={(e) => setRecoveryOptIn(e.target.checked)} /><span><strong>Remind me if I leave checkout</strong><small>Riseora may send up to two cart reminder emails. You can still shop without enabling this.</small></span></label>

        <div className="form-section-title form-section-gap"><span>2</span><div><h2>Delivery address</h2><p>Where should we send your order?</p></div></div>
        {savedAddresses.length > 0 && <div className="checkout-saved-addresses">{savedAddresses.map((item) => <button type="button" key={item.id} className={selectedAddressId === item.id ? "checkout-address-chip active" : "checkout-address-chip"} onClick={() => selectSavedAddress(item)}><span>{item.type}{item.isDefault ? " • DEFAULT" : ""}</span><strong>{item.name}</strong><small>{item.line1}, {item.city} {item.postalCode}</small></button>)}</div>}
        <label>Address<input required name="line1" value={form.line1} onChange={update} autoComplete="address-line1" /></label><label>Address line 2<input name="line2" value={form.line2} onChange={update} autoComplete="address-line2" /></label><label>Landmark<input name="landmark" value={form.landmark} onChange={update} /></label>
        <div className="form-grid three"><label>City<input required name="city" value={form.city} onChange={update} autoComplete="address-level2" /></label><label>State<input required name="state" value={form.state} onChange={update} autoComplete="address-level1" /></label><label>PIN code<input required name="postalCode" value={form.postalCode} onChange={(e) => { setSelectedAddressId(""); setForm((current) => ({ ...current, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })); }} inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="postal-code" /></label></div>
        {user && !selectedAddressId && <div className="phase33-save-address"><label className="checkbox-row"><input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /><span><strong>Save this delivery address</strong><small>Use it faster on your next Riseora order.</small></span></label>{saveAddress && <div className="phase33-address-options"><label>Save as<select value={addressType} onChange={(e) => setAddressType(e.target.value)}><option value="HOME">Home</option><option value="WORK">Work</option><option value="OTHER">Other</option></select></label><label className="checkbox-row compact"><input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} /><span>Make default</span></label></div>}</div>}
        <div className="phase17-checkout-delivery"><Icon name="truck" size={19} /><div><strong>Typical delivery {estimatedFrom}–{estimatedTo}</strong><small>Usually dispatched within {dispatchDays} day{dispatchDays === 1 ? "" : "s"}. Delivery rules are verified against the PIN code before order placement.</small></div></div>
        <div className={`phase21-checkout-zone ${deliveryBlocked ? "unavailable" : postalCodeValid && deliveryQuote?.serviceable ? "available" : "pending"}`}><Icon name={deliveryBlocked ? "alert" : "location"} size={18} /><div><strong>{deliveryChecking ? "Checking delivery area…" : !postalCodeValid ? "Enter a 6-digit PIN code" : deliveryBlocked ? "Delivery unavailable" : deliveryQuote?.matched ? `Delivering via ${deliveryQuote.zoneName}` : "Delivery PIN verified"}</strong><small>{deliveryChecking ? "Riseora is checking shipping, ETA and COD availability." : !postalCodeValid ? "Shipping fee, delivery time and COD availability are calculated from your PIN." : deliveryQuote?.reason || "Store-wide delivery rules apply to this PIN code."}</small>{postalCodeValid && deliveryQuote?.serviceable && <span>{Number(pricing?.shippingFee ?? deliveryQuote.shippingFee ?? 0) > 0 ? `Current shipping ₹${Number(pricing?.shippingFee ?? deliveryQuote.shippingFee).toFixed(0)}` : "Free shipping"} • {deliveryQuote.codAllowed ? "COD supported in this area" : "Prepaid-only area"}</span>}</div></div>

        <div className="form-section-title form-section-gap"><span>3</span><div><h2>Payment</h2><p>Choose how you want to pay.</p></div></div>
        <div className="payment-choice-grid">{onlinePaymentsEnabled && <button type="button" className={paymentMethod === "ONLINE" ? "payment-box selected" : "payment-box"} onClick={() => setPaymentMethod("ONLINE")}><span><Icon name="shield" size={20} /></span><div><strong>Pay online</strong><p>UPI, cards, netbanking & supported wallets.</p></div><b>{paymentMethod === "ONLINE" ? "✓" : ""}</b></button>}<button type="button" disabled={!codEligibility.eligible || paymentRecovery?.status === "PENDING"} className={`${paymentMethod === "COD" ? "payment-box selected" : "payment-box"}${!codEligibility.eligible || paymentRecovery?.status === "PENDING" ? " disabled" : ""}`} onClick={() => codEligibility.eligible && !paymentRecovery?.status && setPaymentMethod("COD")}><span><Icon name="package" size={20} /></span><div><strong>Cash on Delivery</strong><p>{codEligibility.eligible ? "Pay when your order arrives." : "Not available for this order."}</p></div><b>{paymentMethod === "COD" ? "✓" : ""}</b></button></div>
        {!codEligibility.eligible && <div className="phase20-cod-unavailable"><Icon name="shield" size={18} /><div><strong>COD unavailable for this order</strong>{codEligibility.reasons.map((reason) => <small key={reason}>{reason}</small>)}{onlinePaymentsEnabled && <small>Your cart and coupon stay unchanged when you switch to secure online payment.</small>}</div></div>}
        <div className="phase20-checkout-trust"><span><Icon name="shield" size={16} /> Duplicate-order protected</span><span><Icon name="truck" size={16} /> Tracked fulfilment</span><span><Icon name="refresh" size={16} /> {storeConfig.returnsEnabled === false ? "Return policy" : `${storeConfig.returnWindowDays ?? 7}-day return window`}</span></div>
        <button className="button wide checkout-submit" disabled={checkoutDisabled}>{submitting ? (paymentMethod === "ONLINE" ? "Opening secure payment…" : "Placing order…") : `${paymentMethod === "ONLINE" ? "Pay securely" : "Place COD order"} • ₹${total.toFixed(0)}`}</button>
      </form>

      <aside className="summary-card checkout-summary"><h2>Order summary</h2><div className="checkout-items">{checkoutItems.map((item) => <div className="checkout-item" key={item.variantId}><div className="checkout-item-image">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : "R"}<b>{item.quantity}</b></div><div><strong>{item.productName}</strong><span>{item.variantName}</span></div><strong>₹{(item.price * item.quantity).toFixed(0)}</strong></div>)}</div><div className="coupon-box"><label>Coupon code</label><div><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div>{couponMessage && <small className="coupon-success">{couponMessage}</small>}{couponError && <small className="coupon-error">{couponError}</small>}</div>{pricing?.automaticPromotionName && <div className="phase13-auto-offer"><span>✨</span><div><strong>{pricing.automaticPromotionName}</strong><small>{automaticDiscountAmount > 0 ? `Automatic saving ₹${automaticDiscountAmount.toFixed(0)}` : freeItems.length ? "Free gift unlocked automatically" : "Automatic offer applied"}</small></div></div>}{freeItems.length > 0 && <div className="phase13-free-items">{freeItems.map((item) => <div key={`${item.variantId}-${item.promotionLabel}`}><span>FREE</span><strong>{item.productName}</strong><small>{item.variantName} × {item.quantity}</small></div>)}</div>}<div className="summary-row"><span>Subtotal</span><strong>₹{displaySubtotal.toFixed(0)}</strong></div>{automaticDiscountAmount > 0 && <div className="summary-row discount-row"><span>Automatic deal</span><strong>−₹{automaticDiscountAmount.toFixed(0)}</strong></div>}{couponDiscountAmount > 0 && <div className="summary-row discount-row"><span>Coupon {appliedCoupon}</span><strong>−₹{couponDiscountAmount.toFixed(0)}</strong></div>}<div className="summary-row"><span>Shipping{paymentMethod === "COD" && Number(storeConfig.codFee || 0) > 0 ? " + COD fee" : ""}</span><span>{shippingFee > 0 ? `₹${shippingFee.toFixed(0)}` : "FREE"}</span></div><div className="summary-row total"><span>Total</span><strong>₹{total.toFixed(0)}</strong></div></aside>
    </div>
    <div className="phase17-checkout-sticky"><div><small>{buyNowMode ? "BUY NOW TOTAL" : "ORDER TOTAL"}</small><strong>₹{total.toFixed(0)}</strong></div><button form="riseora-checkout-form" type="submit" className="button" disabled={checkoutDisabled}>{submitting ? "PLEASE WAIT…" : paymentMethod === "ONLINE" ? "PAY SECURELY" : "PLACE ORDER"}</button></div>
  </div>;
}

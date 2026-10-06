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
function formatPromiseDate(value) { if (!value) return ""; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }
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
  const { items, subtotal, clearCart, buyNowItems, buyNowSubtotal, clearBuyNow, crossDeviceEnabled, syncStatus, syncNotice, savedBagConflict, useAccountSavedBag, keepBrowserSavedBag } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const buyNowMode = searchParams.get("mode") === "buy-now";
  const checkoutItems = buyNowMode ? buyNowItems : items;
  const checkoutSubtotal = buyNowMode ? buyNowSubtotal : subtotal;
  const checkoutWeightGrams = checkoutItems.reduce((sum, item) => sum + Math.max(0, Number(item.weightGrams || 0)) * Math.max(1, Number(item.quantity || 1)), 0);
  const activeRecoveryKey = buyNowMode ? BUY_NOW_RECOVERY_KEY : RECOVERY_KEY;
  const signature = useMemo(() => `${buyNowMode ? "buy" : "cart"}:${user?.id || "guest"}:${checkoutItems.map((item) => `${item.variantId}:${item.quantity}`).sort().join("|")}`, [buyNowMode, checkoutItems, user?.id]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState(() => String(searchParams.get("coupon") || "").slice(0, 40).toUpperCase());
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
  const [savingsAdvisor, setSavingsAdvisor] = useState(null);
  const [savingsLoading, setSavingsLoading] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryChecking, setDeliveryChecking] = useState(false);
  const [checkoutReadiness, setCheckoutReadiness] = useState(null);
  const [readinessChecking, setReadinessChecking] = useState(false);
  const [paymentReadiness, setPaymentReadiness] = useState(null);
  const [paymentReadinessChecking, setPaymentReadinessChecking] = useState(false);
  const [paymentReadinessError, setPaymentReadinessError] = useState("");
  const [addressReadiness, setAddressReadiness] = useState(null);
  const [addressReadinessChecking, setAddressReadinessChecking] = useState(false);
  const [addressReadinessError, setAddressReadinessError] = useState("");
  const [finalReview, setFinalReview] = useState(null);
  const [finalReviewChecking, setFinalReviewChecking] = useState(false);
  const [finalReviewError, setFinalReviewError] = useState("");
  const [confirmedReviewDigest, setConfirmedReviewDigest] = useState("");
  const beginCheckoutSignature = useRef("");
  const checkoutSessionIdRef = useRef(makeUuid());
  const checkoutEventKeysRef = useRef(new Set());
  const submissionLockRef = useRef(false);
  const [form, setForm] = useState({ customerName: user ? `${user.firstName} ${user.lastName || ""}`.trim() : "", customerEmail: user?.email || "", customerPhone: user?.phone || "", line1: "", line2: "", landmark: "", city: "", state: "Gujarat", postalCode: readSavedPin() });
  const emailReady = !form.customerEmail.trim() || /^\S+@\S+\.\S+$/.test(form.customerEmail.trim());
  const contactReady = form.customerName.trim().length >= 2 && form.customerPhone.trim().length >= 8 && emailReady;
  const addressReady = form.line1.trim().length >= 3 && form.city.trim().length >= 2 && form.state.trim().length >= 2 && /^\d{6}$/.test(form.postalCode);
  const addressProbeReady = contactReady && addressReady;
  const addressReadinessBlocking = addressReadiness?.ready === false;
  const onlineMethodAvailable = paymentReadiness?.methods?.online?.available ?? onlinePaymentsEnabled;
  const codMethodAvailable = paymentReadiness?.methods?.cod?.available ?? codEligibility.eligible;
  const paymentReady = paymentMethod === "COD" ? codMethodAvailable : onlineMethodAvailable;
  const savedBagConflictBlocked = !buyNowMode && crossDeviceEnabled && syncStatus === "conflict";
  const canCheckReadiness = checkoutItems.length > 0 && !savedBagConflictBlocked && contactReady && addressReady && !addressReadinessBlocking && paymentReady && deliveryQuote?.serviceable !== false;

  function requestKey() {
    const current = readJson(REQUEST_KEY);
    if (current?.signature === signature && current?.key) return current.key;
    const key = makeUuid(); writeJson(REQUEST_KEY, { signature, key }); return key;
  }
  function rotateRequestKey() { const key = makeUuid(); writeJson(REQUEST_KEY, { signature, key }); return key; }
  function clearPaymentLocal() { removeLocal(ONLINE_SESSION_KEY); setPaymentRecovery(null); }
  function reportCheckoutEvent(stage, { reasonCode = "", payment = paymentMethod, onceKey = stage } = {}) {
    const key = `${signature}:${onceKey}`;
    if (checkoutEventKeysRef.current.has(key)) return;
    checkoutEventKeysRef.current.add(key);
    apiFetch("/orders/checkout-event", { method: "POST", body: JSON.stringify({ sessionId: checkoutSessionIdRef.current, stage, mode: buyNowMode ? "buy-now" : "cart", ...(payment ? { paymentMethod: payment } : {}), ...(reasonCode ? { reasonCode } : {}) }) }).catch(() => { checkoutEventKeysRef.current.delete(key); });
  }

  useEffect(() => { setAppliedCoupon(""); setDiscountAmount(0); setCouponMessage(""); }, [checkoutSubtotal]);
  useEffect(() => { if (!checkoutItems.length || beginCheckoutSignature.current === signature) return; beginCheckoutSignature.current = signature; trackCommerce("begin_checkout", { items: checkoutItems, value: checkoutSubtotal, checkout_mode: buyNowMode ? "buy_now" : "cart" }); }, [checkoutItems, checkoutSubtotal, buyNowMode, signature]);
  useEffect(() => { if (checkoutItems.length) reportCheckoutEvent("view", { payment: null, onceKey: "view" }); }, [signature, checkoutItems.length]);
  useEffect(() => { if (checkoutItems.length) reportCheckoutEvent("payment_selected", { onceKey: `payment_selected:${paymentMethod}` }); }, [signature, paymentMethod, checkoutItems.length]);
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
    const timer = setTimeout(() => apiFetch(`/store/serviceability?postalCode=${encodeURIComponent(pin)}&subtotal=${encodeURIComponent(checkoutSubtotal)}&paymentMethod=${paymentMethod}&weightGrams=${encodeURIComponent(checkoutWeightGrams)}`).then((response) => {
      if (cancelled) return; const quote = response.data; setDeliveryQuote(quote);
      if (quote?.matched && (quote.city || quote.state)) setForm((current) => ({ ...current, city: current.city.trim() ? current.city : (quote.city || current.city), state: (!current.state.trim() || current.state === "Gujarat") && quote.state ? quote.state : current.state }));
      try { localStorage.setItem("riseora_delivery_pin", pin); } catch {}
    }).catch((err) => { if (!cancelled) setDeliveryQuote({ serviceable: false, matched: false, reason: err.message || "Delivery availability could not be checked." }); }).finally(() => { if (!cancelled) setDeliveryChecking(false); }), 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.postalCode, checkoutSubtotal, checkoutWeightGrams, paymentMethod]);
  useEffect(() => { if (deliveryQuote?.serviceable) reportCheckoutEvent("delivery_ready", { onceKey: `delivery_ready:${form.postalCode}` }); }, [deliveryQuote?.serviceable, form.postalCode, signature]);

  useEffect(() => { if (!user) return; apiFetch("/account/addresses").then((response) => { setSavedAddresses(response.data); const preferred = response.data.find((item) => item.isDefault) || response.data[0]; if (preferred) selectSavedAddress(preferred); }).catch(() => {}); }, [user]);
  useEffect(() => {
    if (!addressProbeReady) { setAddressReadiness(null); setAddressReadinessChecking(false); setAddressReadinessError(""); return; }
    let cancelled = false;
    setAddressReadinessChecking(true);
    setAddressReadinessError("");
    const timer = setTimeout(() => apiFetch("/orders/address-readiness", { method: "POST", body: JSON.stringify(addressReadinessPayload()) })
      .then((response) => { if (!cancelled) setAddressReadiness(response.data); })
      .catch((err) => { if (!cancelled) { setAddressReadiness(null); setAddressReadinessError(err.message || "Address readiness could not be checked right now."); } })
      .finally(() => { if (!cancelled) setAddressReadinessChecking(false); }), 260);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [addressProbeReady, selectedAddressId, form.customerName, form.customerEmail, form.customerPhone, form.line1, form.line2, form.landmark, form.city, form.state, form.postalCode]);
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

  useEffect(() => {
    if (!checkoutItems.length) { setSavingsAdvisor(null); setSavingsLoading(false); return; }
    let cancelled = false;
    setSavingsLoading(true);
    const timer = setTimeout(() => apiFetch("/promotions/offer-wallet", { method: "POST", body: JSON.stringify({
      paymentMethod, currentCouponCode: appliedCoupon || "", customerEmail: form.customerEmail || "", customerPhone: form.customerPhone || "",
      postalCode: /^\d{6}$/.test(form.postalCode) ? form.postalCode : "",
      items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    }) }).then((response) => { if (!cancelled) setSavingsAdvisor(response.data); }).catch(() => { if (!cancelled) setSavingsAdvisor(null); }).finally(() => { if (!cancelled) setSavingsLoading(false); }), 260);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signature, checkoutItems, paymentMethod, appliedCoupon, form.customerEmail, form.customerPhone, form.postalCode]);

  useEffect(() => {
    if (!checkoutItems.length || !contactReady || !addressReady || deliveryQuote?.serviceable === false) {
      setPaymentReadiness(null);
      setPaymentReadinessChecking(false);
      setPaymentReadinessError("");
      return;
    }
    let cancelled = false;
    setPaymentReadinessChecking(true);
    setPaymentReadinessError("");
    const timer = setTimeout(() => {
      apiFetch("/orders/payment-readiness", { method: "POST", body: JSON.stringify(paymentReadinessPayload()) })
        .then((response) => {
          if (cancelled) return;
          const result = response.data;
          setPaymentReadiness(result);
          const cod = result?.methods?.cod;
          if (cod) setCodEligibility((current) => ({ ...current, eligible: Boolean(cod.available), reasons: cod.reasons || [], openCodOrders: cod.openCodOrders || 0, openCodOrderLimit: cod.openCodOrderLimit ?? null, prepaidOnlyProducts: cod.prepaidOnlyProducts || [] }));
          if (!paymentRecovery?.status) {
            if (paymentMethod === "COD" && !result?.methods?.cod?.available && result?.methods?.online?.available) setPaymentMethod("ONLINE");
            else if (paymentMethod === "ONLINE" && !result?.methods?.online?.available && result?.methods?.cod?.available) setPaymentMethod("COD");
          }
        })
        .catch((err) => { if (!cancelled) { setPaymentReadiness(null); setPaymentReadinessError(err.message || "Payment readiness could not be checked right now."); } })
        .finally(() => { if (!cancelled) setPaymentReadinessChecking(false); });
    }, 280);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [signature, contactReady, addressReady, deliveryQuote?.serviceable, appliedCoupon, form.customerName, form.customerEmail, form.customerPhone, form.line1, form.line2, form.landmark, form.city, form.state, form.postalCode, paymentRecovery?.status]);

  useEffect(() => {
    if (!canCheckReadiness) { setCheckoutReadiness(null); setReadinessChecking(false); return; }
    let cancelled = false;
    setReadinessChecking(true);
    const timer = setTimeout(() => {
      apiFetch("/orders/checkout-readiness", { method: "POST", body: JSON.stringify(readinessPayload()) })
        .then((response) => { if (!cancelled) setCheckoutReadiness(response.data); })
        .catch(() => { if (!cancelled) setCheckoutReadiness(null); })
        .finally(() => { if (!cancelled) setReadinessChecking(false); });
    }, 320);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [canCheckReadiness, signature, paymentMethod, appliedCoupon, form.customerName, form.customerEmail, form.customerPhone, form.line1, form.line2, form.landmark, form.city, form.state, form.postalCode]);

  useEffect(() => {
    setConfirmedReviewDigest("");
  }, [signature, paymentMethod, appliedCoupon, form.customerName, form.customerEmail, form.customerPhone, form.line1, form.line2, form.landmark, form.city, form.state, form.postalCode]);

  useEffect(() => {
    if (!checkoutReadiness?.ready) { setFinalReview(null); setFinalReviewChecking(false); setFinalReviewError(""); return; }
    let cancelled = false;
    setFinalReviewChecking(true);
    setFinalReviewError("");
    const timer = setTimeout(() => apiFetch("/orders/final-review", { method: "POST", body: JSON.stringify(readinessPayload()) })
      .then((response) => {
        if (cancelled) return;
        const result = response.data;
        setFinalReview(result);
        setConfirmedReviewDigest((current) => {
          if (current && current !== result?.digest) {
            apiFetch("/orders/final-review/event", { method: "POST", body: JSON.stringify({ type: "CHANGED", paymentMethod }) }).catch(() => {});
            return "";
          }
          return current;
        });
      })
      .catch((err) => { if (!cancelled) { setFinalReview(null); setFinalReviewError(err.message || "Final order review could not be refreshed right now."); } })
      .finally(() => { if (!cancelled) setFinalReviewChecking(false); }), 360);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [checkoutReadiness?.ready, signature, paymentMethod, appliedCoupon, form.customerName, form.customerEmail, form.customerPhone, form.line1, form.line2, form.landmark, form.city, form.state, form.postalCode]);

  function selectSavedAddress(item) { setSelectedAddressId(item.id); setSaveAddress(false); setForm((current) => ({ ...current, customerName: item.name || current.customerName, customerPhone: item.phone || current.customerPhone, line1: item.line1 || "", line2: item.line2 || "", landmark: item.landmark || "", city: item.city || "", state: item.state || "", postalCode: String(item.postalCode || "").replace(/\D/g, "").slice(0, 6) })); }
  function update(event) { setSelectedAddressId(""); setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  if (checkoutItems.length === 0) return <Navigate to={buyNowMode ? "/shop" : "/cart"} replace />;

  async function applyCouponCode(rawCode, source = "manual") {
    const code = String(rawCode || "").trim().toUpperCase(); if (!code) return; setCouponError(""); setCouponMessage(""); setCouponCode(code);
    try {
      const response = await apiFetch("/promotions/cart-preview", { method: "POST", body: JSON.stringify({ couponCode: code, paymentMethod, customerEmail: form.customerEmail || "", customerPhone: form.customerPhone || "", postalCode: /^\d{6}$/.test(form.postalCode) ? form.postalCode : "", items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }) });
      const saving = Number(response.data.couponDiscountAmount || 0);
      setAppliedCoupon(code); setDiscountAmount(saving); setPricing(response.data); setCouponMessage(`Coupon ${code} applied.`);
      if (source === "advisor") apiFetch("/promotions/offer-wallet/event", { method: "POST", body: JSON.stringify({ type: "APPLY", saving }) }).catch(() => {});
    } catch (err) { setAppliedCoupon(""); setDiscountAmount(0); setCouponError(err.message); }
  }
  async function applyCoupon() { return applyCouponCode(couponCode, "manual"); }
  function removeCoupon() { setAppliedCoupon(""); setCouponCode(""); setDiscountAmount(0); setCouponMessage("Coupon removed."); setCouponError(""); }

  function addressReadinessPayload() { return { customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, source: selectedAddressId ? "SAVED" : "MANUAL", shippingAddress: { line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India" } }; }
  function paymentReadinessPayload() { return { customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, couponCode: appliedCoupon || "", shippingAddress: { line1: form.line1, line2: form.line2, landmark: form.landmark, city: form.city, state: form.state, postalCode: form.postalCode, country: "India" }, items: checkoutItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })) }; }
  function useVerifiedArea() {
    const suggestion = addressReadiness?.suggestion;
    if (!suggestion) return;
    setSelectedAddressId("");
    setForm((current) => ({ ...current, city: suggestion.city || current.city, state: suggestion.state || current.state }));
  }
  async function verifyAddressReadiness() {
    if (!addressProbeReady) return { ready: false, message: "Complete your contact and delivery address before continuing." };
    setAddressReadinessChecking(true);
    try {
      const response = await apiFetch("/orders/address-readiness", { method: "POST", body: JSON.stringify(addressReadinessPayload()) });
      setAddressReadiness(response.data);
      setAddressReadinessError("");
      return response.data;
    } catch (err) {
      setAddressReadinessError(err.message || "Address readiness could not be checked right now.");
      return null;
    } finally { setAddressReadinessChecking(false); }
  }
  function checkoutPayload() { return { checkoutRequestKey: requestKey(), ...(confirmedReviewDigest ? { expectedReviewDigest: confirmedReviewDigest } : {}), ...paymentReadinessPayload() }; }
  function readinessPayload() { return { ...paymentReadinessPayload(), paymentMethod }; }
  function confirmFinalReview() {
    if (!finalReview?.digest || finalReviewChecking) return;
    setConfirmedReviewDigest(finalReview.digest);
    setFinalReviewError("");
    apiFetch("/orders/final-review/event", { method: "POST", body: JSON.stringify({ type: "CONFIRMED", paymentMethod }) }).catch(() => {});
  }
  async function verifyFinalOrderReview() {
    setFinalReviewChecking(true);
    try {
      const response = await apiFetch("/orders/final-review", { method: "POST", body: JSON.stringify(readinessPayload()) });
      const latest = response.data;
      setFinalReview(latest);
      setFinalReviewError("");
      if (!confirmedReviewDigest || confirmedReviewDigest !== latest?.digest) {
        if (confirmedReviewDigest) apiFetch("/orders/final-review/event", { method: "POST", body: JSON.stringify({ type: "CHANGED", paymentMethod }) }).catch(() => {});
        setConfirmedReviewDigest("");
        return { ...latest, confirmationRequired: true };
      }
      return latest;
    } catch (err) {
      setFinalReviewError(err.message || "Final order review could not be refreshed right now.");
      return null;
    } finally { setFinalReviewChecking(false); }
  }
  async function verifyCheckoutReadiness() {
    setReadinessChecking(true);
    try {
      const response = await apiFetch("/orders/checkout-readiness", { method: "POST", body: JSON.stringify(readinessPayload()) });
      const result = response.data;
      setCheckoutReadiness(result);
      if (!result?.ready) { reportCheckoutEvent("preflight_fail", { reasonCode: result?.code || "NOT_READY", onceKey: `preflight_fail:${result?.code || "NOT_READY"}` }); return result; }
      reportCheckoutEvent("preflight_pass", { onceKey: "preflight_pass" });
      return result;
    } finally { setReadinessChecking(false); }
  }

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
    writeJson(ONLINE_SESSION_KEY, { sessionId: session.sessionId, signature }); setPaymentRecovery(session); reportCheckoutEvent("payment_recovery", { onceKey: "payment_recovery" });
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
    reportCheckoutEvent("success", { payment: "ONLINE", onceKey: "success" }); clearPaymentLocal(); await persistAddress(); if (buyNowMode) clearBuyNow(); else clearCart(); removeLocal(REQUEST_KEY); navigate(`/order-success/${order.orderNumber}`, { replace: true, state: { order, recoveredPayment: true } });
  }

  async function completeOrder(order) {
    try { const cartToken = localStorage.getItem(activeRecoveryKey); if (cartToken) { await apiFetch("/cart-recovery/converted", { method: "POST", body: JSON.stringify({ cartToken, orderNumber: order.orderNumber }) }); localStorage.removeItem(activeRecoveryKey); } } catch {}
    await persistAddress();
    trackPurchase({ transactionId: order.orderNumber, items: checkoutItems, value: Number(order.totalAmount ?? pricing?.totalAmount ?? checkoutSubtotal), coupon: appliedCoupon || undefined, payment_type: paymentMethod });
    reportCheckoutEvent("success", { onceKey: "success" }); clearPaymentLocal(); removeLocal(REQUEST_KEY); if (buyNowMode) clearBuyNow(); else clearCart(); navigate(`/order-success/${order.orderNumber}`, { replace: true, state: { order } });
  }

  async function submit(event) {
    event.preventDefault();
    if (submissionLockRef.current) { setError("This checkout is already being submitted. Please wait for the current attempt to finish."); return; }
    if (savedBagConflictBlocked) { setError("Your Saved Bag changed on another device. Resolve the bag version before placing this order."); return; }
    submissionLockRef.current = true;
    setSubmitting(true); setError("");
    try {
      const addressCheck = await verifyAddressReadiness();
      if (addressCheck && !addressCheck.ready) { setError(addressCheck.message || "Review your delivery details before continuing."); return; }
      const readiness = await verifyCheckoutReadiness();
      if (!readiness?.ready) { setError(readiness?.message || "Please review the checkout details before continuing."); return; }
      const review = await verifyFinalOrderReview();
      if (!review) { setError("Final order review could not be verified. Please try again."); return; }
      if (review.confirmationRequired) { setError("Your checkout changed or still needs final confirmation. Review the latest summary below and confirm it before continuing."); return; }
      reportCheckoutEvent("submit", { onceKey: "submit" });
      await persistAddress();
      let order;
      if (paymentMethod === "ONLINE") order = await payOnline();
      else { const response = await apiFetch("/orders", { method: "POST", body: JSON.stringify({ ...checkoutPayload(), paymentMethod: "COD" }) }); order = response.data; }
      await completeOrder(order);
    }
    catch (err) {
      if (err?.recoverablePayment) { const stored = readJson(ONLINE_SESSION_KEY); if (stored?.sessionId) checkPaymentStatus({ silent: true }); }
      if (String(err?.message || "").includes("changed after your final review")) { setConfirmedReviewDigest(""); verifyFinalOrderReview().catch(() => {}); }
      setError(err.message);
    }
    finally { submissionLockRef.current = false; setSubmitting(false); }
  }

  const displaySubtotal = Number(pricing?.subtotal ?? checkoutSubtotal); const automaticDiscountAmount = Number(pricing?.automaticDiscountAmount || 0); const couponDiscountAmount = Number(pricing?.couponDiscountAmount ?? discountAmount); const merchandiseAfterDiscount = Math.max(0, displaySubtotal - automaticDiscountAmount - couponDiscountAmount); const threshold = storeConfig.freeShippingThreshold == null ? null : Number(storeConfig.freeShippingThreshold); const baseShipping = threshold !== null && merchandiseAfterDiscount >= threshold ? 0 : Number(storeConfig.flatShippingFee || 0); const codFee = paymentMethod === "COD" ? Number(storeConfig.codFee || 0) : 0; const shippingFee = pricing ? Number(pricing.shippingFee || 0) : baseShipping + codFee; const total = pricing ? Number(pricing.totalAmount || 0) : Math.max(0, merchandiseAfterDiscount + shippingFee); const freeItems = pricing?.freeItems || []; const effectiveDelivery = pricing?.delivery || deliveryQuote; const dispatchDays = Math.max(0, Number(effectiveDelivery?.dispatchWithinDays ?? storeConfig.dispatchWithinDays ?? 2)); const deliveryMinDays = Math.max(1, Number(effectiveDelivery?.deliveryMinDays ?? storeConfig.deliveryMinDays ?? 3)); const deliveryMaxDays = Math.max(deliveryMinDays, Number(effectiveDelivery?.deliveryMaxDays ?? storeConfig.deliveryMaxDays ?? 7)); const estimatedFrom = formatEta(dispatchDays + deliveryMinDays); const estimatedTo = formatEta(dispatchDays + deliveryMaxDays); const postalCodeValid = /^\d{6}$/.test(form.postalCode); const deliveryBlocked = postalCodeValid && deliveryQuote?.serviceable === false; const finalReviewConfirmed = Boolean(finalReview?.digest && confirmedReviewDigest === finalReview.digest); const checkoutDisabled = savedBagConflictBlocked || submitting || paymentChecking || readinessChecking || addressReadinessChecking || finalReviewChecking || !contactReady || !addressReady || addressReadinessBlocking || !postalCodeValid || deliveryBlocked || !paymentReady || paymentReadiness?.ready === false || !checkoutReadiness?.ready || !finalReview?.digest || !finalReviewConfirmed;

  return <div className="container page-space checkout-page">
    <div className="checkout-heading"><p className="eyebrow">{buyNowMode ? "BUY NOW" : "SECURE CHECKOUT"}</p><h1>{buyNowMode ? "Fast checkout" : "Complete your order"}</h1>{buyNowMode && <p className="phase17-buy-now-note">This checkout contains only the product you selected with Buy Now. Your regular cart is unchanged.</p>}</div>
    <div className="phase57-checkout-progress" aria-label="Checkout readiness"><div className={contactReady ? "done" : "active"}><span>1</span><b>Contact</b></div><i></i><div className={addressReady && addressReadiness?.ready !== false && deliveryQuote?.serviceable ? "done" : contactReady ? "active" : ""}><span>2</span><b>Delivery</b></div><i></i><div className={paymentReady ? "done" : addressReady ? "active" : ""}><span>3</span><b>Payment</b></div><i></i><div className={finalReviewConfirmed ? "done" : checkoutReadiness?.ready ? "active" : paymentReady ? "active" : ""}><span>4</span><b>Review</b></div></div>
    {savedBagConflictBlocked && <section className="phase70-checkout-conflict" role="alert"><span><Icon name="alert" size={22} /></span><div><small>PHASE 70 · CHECKOUT CONTINUITY</small><strong>Your Saved Bag changed on another device</strong><p>{syncNotice || "Resolve which bag should continue before Riseora verifies payment and stock."}</p>{savedBagConflict?.savedAt && <em>Account version saved {new Date(savedBagConflict.savedAt).toLocaleString("en-IN")}</em>}</div><div><button type="button" className="button button-secondary" onClick={useAccountSavedBag}>USE ACCOUNT BAG</button><button type="button" className="button" onClick={keepBrowserSavedBag}>KEEP THIS BAG</button></div></section>}
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
        <div className={`phase21-checkout-zone ${deliveryBlocked ? "unavailable" : postalCodeValid && deliveryQuote?.serviceable ? "available" : "pending"}`}><Icon name={deliveryBlocked ? "alert" : "location"} size={18} /><div><strong>{deliveryChecking ? "Checking delivery area…" : !postalCodeValid ? "Enter a 6-digit PIN code" : deliveryBlocked ? "Delivery unavailable" : deliveryQuote?.matched ? `Delivering via ${deliveryQuote.zoneName}` : "Delivery PIN verified"}</strong><small>{deliveryChecking ? "Riseora is checking shipping, ETA and COD availability." : !postalCodeValid ? "Shipping fee, delivery time and COD availability are calculated from your PIN." : deliveryQuote?.reason || "Store-wide delivery rules apply to this PIN code."}</small>{postalCodeValid && deliveryQuote?.serviceable && <span>{Number(pricing?.shippingFee ?? deliveryQuote.shippingFee ?? 0) > 0 ? `Current shipping ₹${Number(pricing?.shippingFee ?? deliveryQuote.shippingFee).toFixed(0)}` : "Free shipping"} • {deliveryQuote.codAllowed ? "COD supported in this area" : "Prepaid-only area"}{deliveryQuote.preferredShippingPartnerName ? ` • Usually via ${deliveryQuote.preferredShippingPartnerName}` : ""}</span>}</div></div>
        <section className={`phase75-address-readiness ${addressReadiness?.quality?.toLowerCase?.() || "pending"}`} aria-label="Address readiness">
          <div className="phase75-address-head"><div><small>PHASE 75 · ADDRESS READINESS</small><strong>Delivery details quality check</strong></div>{addressReadinessChecking && <em>Checking…</em>}{!addressReadinessChecking && addressReadiness && <b>{addressReadiness.quality}</b>}</div>
          {!addressProbeReady && <p className="phase75-address-note">Complete the required contact and delivery fields to check address quality before payment.</p>}
          {addressReadinessError && !addressReadinessChecking && <p className="phase75-address-note attention">{addressReadinessError} Final Checkout validation will still run before order or payment creation.</p>}
          {!addressReadinessChecking && addressReadiness && <><p className="phase75-address-summary">{addressReadiness.message}</p><div className="phase75-address-checks"><span className={addressReadiness.checks?.contact?.ready ? "ok" : ""}>Contact</span><span className={addressReadiness.checks?.address?.ready ? "ok" : ""}>Address</span><span className={addressReadiness.checks?.pin?.ready ? "ok" : ""}>6-digit PIN</span><span className={addressReadiness.checks?.deliveryArea?.matched ? "ok" : ""}>{addressReadiness.checks?.deliveryArea?.zoneName || "Delivery area"}</span></div>{addressReadiness.issues?.length > 0 && <div className="phase75-address-issues">{addressReadiness.issues.slice(0, 4).map((issue) => <span key={`${issue.code}-${issue.field}`} className={issue.severity === "BLOCK" ? "block" : "review"}><Icon name={issue.severity === "BLOCK" ? "alert" : "check"} size={15} />{issue.message}</span>)}</div>}{addressReadiness.suggestion && <div className="phase75-area-suggestion"><div><strong>Configured delivery area differs</strong><span>{[addressReadiness.suggestion.city, addressReadiness.suggestion.state].filter(Boolean).join(", ")}</span></div><button type="button" onClick={useVerifiedArea}>USE VERIFIED CITY/STATE</button></div>}<small className="phase75-address-policy">{addressReadiness.policy}</small></>}
        </section>

        <div className="form-section-title form-section-gap"><span>3</span><div><h2>Payment</h2><p>Choose how you want to pay.</p></div></div>
        <section className={`phase74-payment-readiness ${paymentReadiness?.ready === false ? "blocked" : ""}`} aria-label="Payment method readiness">
          <div className="phase74-payment-readiness-head"><div><small>PHASE 74 · PAYMENT READINESS</small><strong>Know your payment options before submitting</strong></div>{paymentReadinessChecking && <em>Checking…</em>}</div>
          {paymentReadinessError && !paymentReadinessChecking && <p className="phase74-payment-note">{paymentReadinessError} Final Checkout verification will still run before order or payment creation.</p>}
          {!paymentReadinessChecking && paymentReadiness && <><p className="phase74-payment-summary">{paymentReadiness.summary}</p><div className="phase74-payment-method-grid">
            <article className={paymentReadiness.methods?.online?.available ? "available" : "unavailable"}><div><span>SECURE ONLINE</span><b>{paymentReadiness.methods?.online?.available ? "AVAILABLE" : "UNAVAILABLE"}</b></div><strong>{paymentReadiness.methods?.online?.totalAmount != null ? `₹${Number(paymentReadiness.methods.online.totalAmount).toFixed(0)}` : "—"}</strong><small>{paymentReadiness.methods?.online?.shippingFee != null ? `Shipping ₹${Number(paymentReadiness.methods.online.shippingFee).toFixed(0)}` : paymentReadiness.methods?.online?.reasons?.[0] || "Provider not configured"}</small><em>{paymentReadiness.methods?.online?.note}</em></article>
            <article className={paymentReadiness.methods?.cod?.available ? "available" : "unavailable"}><div><span>CASH ON DELIVERY</span><b>{paymentReadiness.methods?.cod?.available ? "AVAILABLE" : "UNAVAILABLE"}</b></div><strong>{paymentReadiness.methods?.cod?.totalAmount != null ? `₹${Number(paymentReadiness.methods.cod.totalAmount).toFixed(0)}` : "—"}</strong><small>{paymentReadiness.methods?.cod?.shippingFee != null ? `Shipping + COD ₹${Number(paymentReadiness.methods.cod.shippingFee).toFixed(0)}` : paymentReadiness.methods?.cod?.reasons?.[0] || "COD rules are being checked"}</small>{paymentReadiness.methods?.cod?.reasons?.slice(1, 3).map((reason) => <em key={reason}>{reason}</em>)}</article>
          </div>{paymentReadiness.recommendationReason && <div className="phase74-payment-guidance"><Icon name="check" size={17} /><span><strong>{paymentReadiness.recommendedMethod ? "Lower current total" : "Payment guidance"}</strong>{paymentReadiness.recommendationReason}</span></div>}<small className="phase74-payment-policy">{paymentReadiness.policy}</small></>}
        </section>
        <div className="payment-choice-grid"><button type="button" disabled={!onlineMethodAvailable} className={`${paymentMethod === "ONLINE" ? "payment-box selected" : "payment-box"}${!onlineMethodAvailable ? " disabled" : ""}`} onClick={() => onlineMethodAvailable && setPaymentMethod("ONLINE")}><span><Icon name="shield" size={20} /></span><div><strong>Pay online</strong><p>{onlineMethodAvailable ? "UPI, cards, netbanking & supported wallets." : "Secure online payment is unavailable here."}</p></div><b>{paymentMethod === "ONLINE" ? "✓" : ""}</b></button><button type="button" disabled={!codMethodAvailable || paymentRecovery?.status === "PENDING"} className={`${paymentMethod === "COD" ? "payment-box selected" : "payment-box"}${!codMethodAvailable || paymentRecovery?.status === "PENDING" ? " disabled" : ""}`} onClick={() => codMethodAvailable && !paymentRecovery?.status && setPaymentMethod("COD")}><span><Icon name="package" size={20} /></span><div><strong>Cash on Delivery</strong><p>{codMethodAvailable ? "Pay when your order arrives." : "Not available for this order."}</p></div><b>{paymentMethod === "COD" ? "✓" : ""}</b></button></div>
        {!codMethodAvailable && <div className="phase20-cod-unavailable"><Icon name="shield" size={18} /><div><strong>COD unavailable for this order</strong>{(paymentReadiness?.methods?.cod?.reasons || codEligibility.reasons).map((reason) => <small key={reason}>{reason}</small>)}{onlineMethodAvailable && <small>Your cart and coupon stay unchanged when you switch to secure online payment.</small>}</div></div>}
        <div className="phase20-checkout-trust"><span><Icon name="shield" size={16} /> Duplicate-order protected</span><span><Icon name="truck" size={16} /> Tracked fulfilment</span><span><Icon name="refresh" size={16} /> {storeConfig.returnsEnabled === false ? "Return policy" : `${storeConfig.returnWindowDays ?? 7}-day return window`}</span></div>
        <div className={`phase57-checkout-confidence ${checkoutReadiness?.ready ? "ready" : checkoutReadiness ? "attention" : "pending"}`}>
          <div className="phase57-confidence-head"><span><Icon name={checkoutReadiness?.ready ? "shield" : checkoutReadiness ? "alert" : "check"} size={20} /></span><div><strong>{readinessChecking ? "Reviewing your checkout…" : checkoutReadiness?.ready ? "Ready to place your order" : checkoutReadiness ? "One detail needs attention" : "Final checkout review"}</strong><small>{readinessChecking ? "Confirming live stock, delivery, payment and final pricing." : checkoutReadiness?.message || "Complete contact, delivery and payment details and Riseora will verify everything before order placement."}</small></div></div>
          <div className="phase57-confidence-checks">
            <span className={contactReady ? "ok" : ""}>✓ Contact</span>
            <span className={addressReady && addressReadiness?.ready !== false && deliveryQuote?.serviceable ? "ok" : ""}>✓ Delivery</span>
            <span className={paymentReady ? "ok" : ""}>✓ Payment</span>
            <span className={checkoutReadiness?.checks?.stock ? "ok" : ""}>✓ Live stock</span>
            <span className={checkoutReadiness?.checks?.pricing ? "ok" : ""}>✓ Final total</span>
          </div>
          {checkoutReadiness?.ready && <div className="phase57-confidence-promise"><div><small>DELIVERY PROMISE</small><strong>{formatPromiseDate(checkoutReadiness.delivery?.estimatedFrom)}–{formatPromiseDate(checkoutReadiness.delivery?.estimatedTo)}</strong><span>{checkoutReadiness.delivery?.shippingPartnerName ? `Usually via ${checkoutReadiness.delivery.shippingPartnerName}` : checkoutReadiness.delivery?.zoneName || "Verified for your PIN code"}</span></div><div><small>VERIFIED TOTAL</small><strong>₹{Number(checkoutReadiness.pricing?.totalAmount ?? total).toFixed(0)}</strong><span>{Number(checkoutReadiness.pricing?.shippingFee || 0) > 0 ? `Includes ₹${Number(checkoutReadiness.pricing.shippingFee).toFixed(0)} shipping` : "Shipping included / free"}</span></div></div>}
          {checkoutReadiness?.stockIssues?.length > 0 && <div className="phase57-stock-warning">{checkoutReadiness.stockIssues.slice(0, 2).map((item) => <small key={item.variantId}>{item.productName}: {item.availableQuantity} available for {item.requestedQuantity} requested</small>)}</div>}
        </div>
        <section className={`phase76-final-review ${finalReviewConfirmed ? "confirmed" : finalReview?.digest ? "ready" : "pending"}`} aria-label="Final order review">
          <div className="phase76-review-head"><div><small>PHASE 76 · FINAL ORDER REVIEW</small><strong>Confirm exactly what Riseora will submit</strong></div><b>{finalReviewConfirmed ? "CONFIRMED" : finalReviewChecking ? "REFRESHING" : finalReview?.digest ? "REVIEW REQUIRED" : "WAITING"}</b></div>
          {finalReviewError && <p className="phase76-review-error">{finalReviewError}</p>}
          {!finalReview && !finalReviewError && <p className="phase76-review-note">Complete the live checkout checks above and Riseora will prepare one final server snapshot before order/payment creation.</p>}
          {finalReview && <><div className="phase76-review-grid">
            <article><small>PRODUCTS</small><strong>{finalReview.itemSummary?.paidUnits ?? 0} item{Number(finalReview.itemSummary?.paidUnits || 0) === 1 ? "" : "s"}</strong><span>{finalReview.itemSummary?.freeUnits ? `+ ${finalReview.itemSummary.freeUnits} complimentary` : "Live catalogue rechecked"}</span></article>
            <article><small>DELIVERY</small><strong>{formatPromiseDate(finalReview.delivery?.estimatedFrom)}–{formatPromiseDate(finalReview.delivery?.estimatedTo)}</strong><span>{finalReview.delivery?.zoneName || `${finalReview.delivery?.city || ""}, ${finalReview.delivery?.state || ""}`}</span></article>
            <article><small>PAYMENT</small><strong>{finalReview.payment?.label || paymentMethod}</strong><span>{finalReview.delivery?.shippingPartnerName ? `Usually via ${finalReview.delivery.shippingPartnerName}` : `PIN ${finalReview.delivery?.postalCode || form.postalCode}`}</span></article>
            <article><small>FINAL TOTAL</small><strong>₹{Number(finalReview.pricing?.totalAmount || 0).toFixed(0)}</strong><span>{Number(finalReview.pricing?.shippingFee || 0) > 0 ? `₹${Number(finalReview.pricing.shippingFee).toFixed(0)} shipping included` : "Shipping included / free"}</span></article>
          </div>
          <div className="phase76-review-details"><div><small>DELIVER TO</small><strong>{finalReview.delivery?.recipient}</strong><span>{finalReview.delivery?.city}, {finalReview.delivery?.state} {finalReview.delivery?.postalCode} · phone ending {finalReview.delivery?.phoneMasked}</span></div><div><small>SAVINGS</small><strong>{finalReview.pricing?.couponCode ? `Coupon ${finalReview.pricing.couponCode}` : finalReview.pricing?.automaticPromotionName || "Current Riseora pricing"}</strong><span>{Number(finalReview.pricing?.discountAmount || 0) > 0 ? `₹${Number(finalReview.pricing.discountAmount).toFixed(0)} total saving applied` : "No checkout discount currently applied"}</span></div></div>
          {!finalReviewConfirmed ? <button type="button" className="button phase76-confirm-review" onClick={confirmFinalReview} disabled={finalReviewChecking}>CONFIRM FINAL REVIEW</button> : <><div className="phase76-confirmed-note"><Icon name="shield" size={17} /><span><strong>Final review confirmed.</strong> Riseora will reject the order/payment start if this server snapshot changes before mutation.</span></div><div className="phase77-submit-safety"><Icon name="shield" size={16} /><span><strong>PHASE 77 · PROTECTED SUBMISSION</strong> Duplicate taps reuse the same protected checkout key; a changed payload cannot silently reuse another reservation.</span></div></>}
          <small className="phase76-review-policy">{finalReview.policy}</small></>}
        </section>
        <button className="button wide checkout-submit" disabled={checkoutDisabled}>{submitting ? (paymentMethod === "ONLINE" ? "Opening secure payment…" : "Placing order…") : readinessChecking || finalReviewChecking ? "VERIFYING FINAL REVIEW…" : checkoutReadiness && !checkoutReadiness.ready ? "RECHECK & CONTINUE" : !finalReviewConfirmed ? "CONFIRM FINAL REVIEW ABOVE" : `${paymentMethod === "ONLINE" ? "Pay securely" : "Place COD order"} • ₹${total.toFixed(0)}`}</button>
      </form>

      <aside className="summary-card checkout-summary"><h2>Order summary</h2><div className="checkout-items">{checkoutItems.map((item) => <div className="checkout-item" key={item.variantId}><div className="checkout-item-image">{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : "R"}<b>{item.quantity}</b></div><div><strong>{item.productName}</strong><span>{item.variantName}</span></div><strong>₹{(item.price * item.quantity).toFixed(0)}</strong></div>)}</div><div className="coupon-box"><label>Coupon code</label><div><input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter code" /><button type="button" onClick={applyCoupon}>Apply</button></div>{appliedCoupon && <button type="button" className="phase62-remove-coupon" onClick={removeCoupon}>Remove applied coupon</button>}{couponMessage && <small className="coupon-success">{couponMessage}</small>}{couponError && <small className="coupon-error">{couponError}</small>}</div><section className="phase62-offer-wallet" aria-label="Savings advisor"><div className="phase62-offer-wallet-head"><div><small>PHASE 62 · SAVINGS ADVISOR</small><strong>Best savings for this order</strong></div>{Number(savingsAdvisor?.bestPotentialSaving || 0) > 0 && <b>Save up to ₹{Number(savingsAdvisor.bestPotentialSaving).toFixed(0)}</b>}</div>{savingsLoading && <p className="phase62-savings-loading">Checking automatic deals and your available vouchers…</p>}{!savingsLoading && savingsAdvisor?.automatic && (Number(savingsAdvisor.automatic.saving || 0) > 0 || savingsAdvisor.automatic.freeItems?.length > 0) && <div className="phase62-saving-line automatic"><div><span>AUTOMATIC</span><strong>{savingsAdvisor.automatic.name || "Riseora deal"}</strong><small>{Number(savingsAdvisor.automatic.saving || 0) > 0 ? `Already saving ₹${Number(savingsAdvisor.automatic.saving).toFixed(0)}` : `${savingsAdvisor.automatic.freeItems.length} free item${savingsAdvisor.automatic.freeItems.length === 1 ? "" : "s"} unlocked`}</small></div><em>Applied</em></div>}{!savingsLoading && savingsAdvisor?.bestCoupon && <div className={`phase62-saving-line best ${appliedCoupon === savingsAdvisor.bestCoupon.code ? "active" : ""}`}><div><span>BEST SAVING CODE</span><strong>{savingsAdvisor.bestCoupon.code}</strong><small>Save ₹{Number(savingsAdvisor.bestCoupon.saving || 0).toFixed(0)}{savingsAdvisor.bestCoupon.endsAt ? ` · valid until ${new Date(savingsAdvisor.bestCoupon.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</small></div>{appliedCoupon === savingsAdvisor.bestCoupon.code ? <em>Active</em> : <button type="button" onClick={() => applyCouponCode(savingsAdvisor.bestCoupon.code, "advisor")}>Apply best</button>}</div>}{!savingsLoading && savingsAdvisor?.vouchers?.filter((item) => item.code !== savingsAdvisor?.bestCoupon?.code).slice(0, 2).map((voucher) => <div className="phase62-saving-line" key={voucher.code}><div><span>YOUR REWARD VOUCHER</span><strong>{voucher.code}</strong><small>{voucher.eligible ? `Save ₹${Number(voucher.saving || 0).toFixed(0)}` : voucher.reason || "Not eligible for this cart yet"}</small></div>{voucher.eligible && appliedCoupon !== voucher.code ? <button type="button" onClick={() => applyCouponCode(voucher.code, "advisor")}>Apply</button> : <em>{appliedCoupon === voucher.code ? "Active" : "Not eligible"}</em>}</div>)}{!savingsLoading && savingsAdvisor && !savingsAdvisor.signedIn && <div className="phase62-signin-savings"><strong>Have Riseora reward vouchers?</strong><span>Sign in to compare your private vouchers against this cart.</span><button type="button" onClick={() => navigate("/login")}>Sign in</button></div>}{!savingsLoading && savingsAdvisor?.storeOffers?.length > 0 && <div className="phase62-store-offers"><div><strong>Store offers</strong><span>Explore current Riseora promotions without exposing private coupon codes.</span></div>{savingsAdvisor.storeOffers.slice(0, 2).map((offer) => <button key={offer.id} type="button" onClick={() => navigate(offer.ctaLink || "/offers")}><b>{offer.badge || "OFFER"}</b><span>{offer.title}</span></button>)}</div>}{!savingsLoading && savingsAdvisor?.policy && <small className="phase62-savings-policy">{savingsAdvisor.policy}</small>}</section>{pricing?.automaticPromotionName && <div className="phase13-auto-offer"><span>✨</span><div><strong>{pricing.automaticPromotionName}</strong><small>{automaticDiscountAmount > 0 ? `Automatic saving ₹${automaticDiscountAmount.toFixed(0)}` : freeItems.length ? "Free gift unlocked automatically" : "Automatic offer applied"}</small></div></div>}{freeItems.length > 0 && <div className="phase13-free-items">{freeItems.map((item) => <div key={`${item.variantId}-${item.promotionLabel}`}><span>FREE</span><strong>{item.productName}</strong><small>{item.variantName} × {item.quantity}</small></div>)}</div>}<div className="summary-row"><span>Subtotal</span><strong>₹{displaySubtotal.toFixed(0)}</strong></div>{automaticDiscountAmount > 0 && <div className="summary-row discount-row"><span>Automatic deal</span><strong>−₹{automaticDiscountAmount.toFixed(0)}</strong></div>}{couponDiscountAmount > 0 && <div className="summary-row discount-row"><span>Coupon {appliedCoupon}</span><strong>−₹{couponDiscountAmount.toFixed(0)}</strong></div>}<div className="summary-row"><span>Shipping{paymentMethod === "COD" && Number(storeConfig.codFee || 0) > 0 ? " + COD fee" : ""}</span><span>{shippingFee > 0 ? `₹${shippingFee.toFixed(0)}` : "FREE"}</span></div><div className="summary-row total"><span>Total</span><strong>₹{total.toFixed(0)}</strong></div></aside>
    </div>
    <div className="phase17-checkout-sticky"><div><small>{buyNowMode ? "BUY NOW TOTAL" : "ORDER TOTAL"}</small><strong>₹{total.toFixed(0)}</strong></div><button form="riseora-checkout-form" type="submit" className="button" disabled={checkoutDisabled}>{submitting ? "PLEASE WAIT…" : !finalReviewConfirmed ? "CONFIRM REVIEW" : paymentMethod === "ONLINE" ? "PAY SECURELY" : "PLACE ORDER"}</button></div>
  </div>;
}

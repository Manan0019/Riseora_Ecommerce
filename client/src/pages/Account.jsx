import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";
import ProductCard from "../components/ProductCard";

const emptyAddress = {
  name: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Gujarat",
  postalCode: "",
  country: "India",
  type: "HOME",
  isDefault: false,
};

export default function Account() {
  const { user, logout, updateUser, replaceToken } = useAuth();
  const [profile, setProfile] = useState({ firstName: user?.firstName || "", lastName: user?.lastName || "", phone: user?.phone || "" });
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [buyAgain, setBuyAgain] = useState([]);
  const [shoppingAlerts, setShoppingAlerts] = useState({ stock: [], price: [] });

  async function refreshAddresses() {
    const response = await apiFetch("/account/addresses");
    setAddresses(response.data);
  }

  async function refreshShoppingAlerts() {
    const response = await apiFetch("/account/shopping-alerts");
    setShoppingAlerts(response.data || { stock: [], price: [] });
  }

  useEffect(() => {
    Promise.all([apiFetch("/account/profile"), apiFetch("/account/addresses"), apiFetch("/account/buy-again"), apiFetch("/account/shopping-alerts")])
      .then(([profileResponse, addressResponse, buyAgainResponse, alertResponse]) => {
        const current = profileResponse.data;
        setProfile({ firstName: current.firstName || "", lastName: current.lastName || "", phone: current.phone || "" });
        setAddresses(addressResponse.data);
        setBuyAgain(buyAgainResponse.data || []);
        setShoppingAlerts(alertResponse.data || { stock: [], price: [] });
      })
      .catch((e) => setError(e.message));
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await apiFetch("/account/profile", { method: "PATCH", body: JSON.stringify(profile) });
      updateUser(response.data);
      setMessage("Profile updated.");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function addAddress(event) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      await apiFetch("/account/addresses", { method: "POST", body: JSON.stringify(address) });
      setAddress({ ...emptyAddress, name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim(), phone: user?.phone || "" });
      setShowAddressForm(false);
      setMessage("Address saved.");
      await refreshAddresses();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }


  async function changePassword(event) {
    event.preventDefault();
    setError(""); setMessage("");
    if (passwordForm.newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return setError("New passwords do not match.");
    setSaving(true);
    try {
      const response = await apiFetch("/account/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      replaceToken(response.data.token);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setMessage(response.message || "Password changed successfully.");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function setDefault(id) {
    try { await apiFetch(`/account/addresses/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }); await refreshAddresses(); }
    catch (e) { setError(e.message); }
  }

  async function removeAddress(id) {
    if (!window.confirm("Remove this saved address?")) return;
    try { await apiFetch(`/account/addresses/${id}`, { method: "DELETE" }); await refreshAddresses(); }
    catch (e) { setError(e.message); }
  }

  async function cancelShoppingAlert(kind, id) {
    setError(""); setMessage("");
    try {
      const response = await apiFetch(`/account/shopping-alerts/${kind}/${id}`, { method: "DELETE" });
      setMessage(response.message || "Shopping alert cancelled.");
      await refreshShoppingAlerts();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="container page-space account-page">
      <div className="account-hero">
        <div className="account-avatar">{(user?.firstName || "R").slice(0, 1).toUpperCase()}</div>
        <div><p className="eyebrow">MY RISEORA</p><h1>Hello, {user?.firstName}</h1><p>{user?.email}</p></div>
      </div>

      {message && <p className="alert success">{message}</p>}
      {error && <p className="alert error">{error}</p>}

      <div className="account-shortcuts">
        <Link to="/orders"><Icon name="orders" /><span><strong>My orders</strong><small>Track and review purchases</small></span><b>›</b></Link>
        <Link to="/wishlist"><Icon name="heart" /><span><strong>Wishlist</strong><small>Your saved products</small></span><b>›</b></Link>
        <Link to="/notifications"><Icon name="bell" /><span><strong>Notifications</strong><small>Orders and Riseora updates</small></span><b>›</b></Link>
        <Link to="/support"><Icon name="mail" /><span><strong>Support</strong><small>Requests, replies & help history</small></span><b>›</b></Link>
        <Link to="/security"><Icon name="shield" /><span><strong>Security & privacy</strong><small>Sessions, activity & data export</small></span><b>›</b></Link>
        <Link to="/rewards"><Icon name="sparkles" /><span><strong>Riseora Rewards</strong><small>Points, vouchers & referrals</small></span><b>›</b></Link>
        <Link to="/refills"><Icon name="refresh" /><span><strong>Refill reminders</strong><small>Plan repeat essentials</small></span><b>›</b></Link>
        <a href="#shopping-alerts"><Icon name="tag" /><span><strong>Shopping alerts</strong><small>Price drops and restocks</small></span><b>›</b></a>
        <Link to="/returns"><Icon name="truck" /><span><strong>Returns & refunds</strong><small>Track return requests and refunds</small></span><b>›</b></Link>
      </div>

      {buyAgain.length > 0 && <section className="phase23-buy-again-section">
        <div className="section-heading phase23-section-heading"><div><p className="eyebrow">BUY AGAIN</p><h2>Your repeat favourites</h2><p className="muted">Fresh prices, current stock and current purchase limits are always used.</p></div><Link className="text-link" to="/orders">Past orders →</Link></div>
        <div className="phase23-product-rail">{buyAgain.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
      </section>}


      <section className="phase29-shopping-alerts" id="shopping-alerts">
        <div className="section-heading phase23-section-heading"><div><p className="eyebrow">SHOPPING ALERTS</p><h2>Your price &amp; stock watches</h2><p className="muted">Manage alerts tied to your Riseora account email.</p></div></div>
        <div className="phase29-alert-grid">
          <article className="phase29-alert-panel"><div className="phase29-alert-panel-head"><span><Icon name="tag" /></span><div><h3>Price watches</h3><small>{shoppingAlerts.price.filter((item) => item.status === "PENDING").length} active</small></div></div><div className="phase29-account-alert-list">{shoppingAlerts.price.map((item) => <div key={item.id} className="phase29-account-alert"><div><Link to={`/product/${item.variant?.product?.slug || ""}`}><strong>{item.variant?.product?.name || "Product"}</strong></Link><small>{item.variant?.name} · current ₹{Number(item.variant?.sellingPrice || 0).toFixed(0)}</small><small>{item.targetPrice == null ? `Any drop below ₹${Number(item.subscribedPrice || 0).toFixed(0)}` : `Target ₹${Number(item.targetPrice).toFixed(0)}`}</small></div><span className={`phase29-alert-state ${String(item.status).toLowerCase()}`}>{item.status}</span>{item.status === "PENDING" && <button type="button" onClick={() => cancelShoppingAlert("price", item.id)}>Cancel</button>}</div>)}{!shoppingAlerts.price.length && <p className="muted">No price watches yet. Open any product to start one.</p>}</div></article>
          <article className="phase29-alert-panel"><div className="phase29-alert-panel-head"><span><Icon name="bell" /></span><div><h3>Back-in-stock alerts</h3><small>{shoppingAlerts.stock.filter((item) => item.status === "PENDING").length} active</small></div></div><div className="phase29-account-alert-list">{shoppingAlerts.stock.map((item) => <div key={item.id} className="phase29-account-alert"><div><Link to={`/product/${item.variant?.product?.slug || ""}`}><strong>{item.variant?.product?.name || "Product"}</strong></Link><small>{item.variant?.name} · stock {Number(item.variant?.stockQuantity || 0)}</small></div><span className={`phase29-alert-state ${String(item.status).toLowerCase()}`}>{item.status}</span>{item.status === "PENDING" && <button type="button" onClick={() => cancelShoppingAlert("stock", item.id)}>Cancel</button>}</div>)}{!shoppingAlerts.stock.length && <p className="muted">No back-in-stock alerts yet.</p>}</div></article>
        </div>
      </section>

      <div className="account-grid">
        <form className="account-card" onSubmit={saveProfile}>
          <div className="account-card-head"><div><p className="eyebrow">PROFILE</p><h2>Personal details</h2></div></div>
          <div className="form-grid two"><label>First name<input required value={profile.firstName} onChange={(e) => setProfile((v) => ({ ...v, firstName: e.target.value }))} /></label><label>Last name<input value={profile.lastName} onChange={(e) => setProfile((v) => ({ ...v, lastName: e.target.value }))} /></label></div>
          <label>Phone<input value={profile.phone} onChange={(e) => setProfile((v) => ({ ...v, phone: e.target.value }))} inputMode="tel" /></label>
          <label>Email<input disabled value={user?.email || ""} /></label>
          <button className="button" disabled={saving}>Save profile</button>
        </form>

        <section className="account-card address-card-section">
          <div className="account-card-head"><div><p className="eyebrow">DELIVERY</p><h2>Saved addresses</h2></div><button className="button button-secondary account-add-address" onClick={() => setShowAddressForm((v) => !v)}>{showAddressForm ? "Close" : "+ Add"}</button></div>
          {addresses.length === 0 && !showAddressForm && <div className="account-empty">No saved address yet.</div>}
          <div className="saved-address-list">{addresses.map((item) => <article className={item.isDefault ? "saved-address default" : "saved-address"} key={item.id}><div className="saved-address-top"><span>{item.type}</span>{item.isDefault && <b>DEFAULT</b>}</div><strong>{item.name}</strong><p>{item.line1}{item.line2 ? `, ${item.line2}` : ""}<br />{item.city}, {item.state} {item.postalCode}<br />{item.phone}</p><div><button onClick={() => setDefault(item.id)} disabled={item.isDefault}>Set default</button><button className="danger-text" onClick={() => removeAddress(item.id)}>Remove</button></div></article>)}</div>

          {showAddressForm && <form className="inline-address-form" onSubmit={addAddress}>
            <div className="form-grid two"><label>Full name<input required value={address.name} onChange={(e) => setAddress((v) => ({ ...v, name: e.target.value }))} /></label><label>Phone<input required value={address.phone} onChange={(e) => setAddress((v) => ({ ...v, phone: e.target.value }))} inputMode="tel" /></label></div>
            <label>Address<input required value={address.line1} onChange={(e) => setAddress((v) => ({ ...v, line1: e.target.value }))} /></label>
            <label>Address line 2<input value={address.line2} onChange={(e) => setAddress((v) => ({ ...v, line2: e.target.value }))} /></label>
            <div className="form-grid two"><label>City<input required value={address.city} onChange={(e) => setAddress((v) => ({ ...v, city: e.target.value }))} /></label><label>PIN code<input required value={address.postalCode} onChange={(e) => setAddress((v) => ({ ...v, postalCode: e.target.value }))} inputMode="numeric" /></label></div>
            <div className="form-grid two"><label>State<input required value={address.state} onChange={(e) => setAddress((v) => ({ ...v, state: e.target.value }))} /></label><label>Type<select value={address.type} onChange={(e) => setAddress((v) => ({ ...v, type: e.target.value }))}><option>HOME</option><option>WORK</option><option>OTHER</option></select></label></div>
            <label className="checkbox-row"><input type="checkbox" checked={address.isDefault} onChange={(e) => setAddress((v) => ({ ...v, isDefault: e.target.checked }))} /> Make default address</label>
            <button className="button wide" disabled={saving}>Save address</button>
          </form>}
        </section>
      </div>

      <form id="security" className="account-card account-security-card" onSubmit={changePassword}>
        <div className="account-card-head"><div><p className="eyebrow">SECURITY</p><h2>Change password</h2></div></div>
        <div className="form-grid three"><label>Current password<input type="password" required value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((v) => ({ ...v, currentPassword: e.target.value }))} autoComplete="current-password" /></label><label>New password<input type="password" required minLength="8" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((v) => ({ ...v, newPassword: e.target.value }))} autoComplete="new-password" /></label><label>Confirm new password<input type="password" required minLength="8" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((v) => ({ ...v, confirmPassword: e.target.value }))} autoComplete="new-password" /></label></div>
        <p className="account-security-note">Changing your password invalidates older Riseora login sessions.</p>
        <button className="button" disabled={saving}>Update password</button>
      </form>

      <button className="account-logout" onClick={logout}><Icon name="logout" size={18} /> Sign out</button>
    </div>
  );
}

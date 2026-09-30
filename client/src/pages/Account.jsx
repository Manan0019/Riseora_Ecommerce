import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/Icons";

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
  const { user, logout, updateUser } = useAuth();
  const [profile, setProfile] = useState({ firstName: user?.firstName || "", lastName: user?.lastName || "", phone: user?.phone || "" });
  const [addresses, setAddresses] = useState([]);
  const [address, setAddress] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function refreshAddresses() {
    const response = await apiFetch("/account/addresses");
    setAddresses(response.data);
  }

  useEffect(() => {
    Promise.all([apiFetch("/account/profile"), apiFetch("/account/addresses")])
      .then(([profileResponse, addressResponse]) => {
        const current = profileResponse.data;
        setProfile({ firstName: current.firstName || "", lastName: current.lastName || "", phone: current.phone || "" });
        setAddresses(addressResponse.data);
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

  async function setDefault(id) {
    try { await apiFetch(`/account/addresses/${id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) }); await refreshAddresses(); }
    catch (e) { setError(e.message); }
  }

  async function removeAddress(id) {
    if (!window.confirm("Remove this saved address?")) return;
    try { await apiFetch(`/account/addresses/${id}`, { method: "DELETE" }); await refreshAddresses(); }
    catch (e) { setError(e.message); }
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
        <Link to="/returns"><Icon name="truck" /><span><strong>Returns & refunds</strong><small>Track return requests and refunds</small></span><b>›</b></Link>
      </div>

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

      <button className="account-logout" onClick={logout}><Icon name="logout" size={18} /> Sign out</button>
    </div>
  );
}

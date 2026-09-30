import { useEffect, useState } from "react";
import { apiFetch } from "../../api/http";
import { Icon } from "../../components/Icons";

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function refresh(query = "") {
    const response = await apiFetch(`/admin/customers${query ? `?search=${encodeURIComponent(query)}` : ""}`);
    setCustomers(response.data);
  }

  useEffect(() => { refresh().catch((e) => setError(e.message)); }, []);

  async function toggle(customer) {
    try { await apiFetch(`/admin/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !customer.isActive }) }); await refresh(search); }
    catch (e) { setError(e.message); }
  }

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">CUSTOMERS</p><h1>Customer accounts</h1><p>See registered shoppers, order activity and account status.</p></div></div>
    {error && <p className="alert error">{error}</p>}
    <section className="admin-panel">
      <form className="admin-search-bar" onSubmit={(e) => { e.preventDefault(); refresh(search).catch((err) => setError(err.message)); }}><Icon name="search" size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" /><button>Search</button></form>
      {customers.length === 0 ? <div className="admin-empty">No customers found.</div> : <div className="customer-admin-list">{customers.map((customer) => <article key={customer.id} className="customer-admin-card"><div className="customer-avatar">{customer.firstName.slice(0, 1).toUpperCase()}</div><div className="customer-admin-main"><strong>{customer.firstName} {customer.lastName || ""}</strong><span>{customer.email}</span><small>{customer.phone || "No phone"} • Joined {new Date(customer.createdAt).toLocaleDateString()}</small></div><div className="customer-admin-metrics"><span><strong>{customer.orderCount}</strong> orders</span><span><strong>₹{Number(customer.totalSpent).toFixed(0)}</strong> spent</span></div><button className={customer.isActive ? "state-toggle active" : "state-toggle"} onClick={() => toggle(customer)}>{customer.isActive ? "Active" : "Disabled"}</button></article>)}</div>}
    </section>
  </>;
}

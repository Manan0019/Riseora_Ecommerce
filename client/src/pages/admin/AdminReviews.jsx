import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api/http";

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const response = await apiFetch(`/admin/reviews?status=${status}`);
      setReviews(response.data);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [status]);

  async function moderate(id, isApproved) {
    try {
      await apiFetch(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ isApproved }) });
      await load();
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!window.confirm("Delete this review permanently?")) return;
    try { await apiFetch(`/admin/reviews/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((item) => `${item.product?.name || ""} ${item.user?.firstName || ""} ${item.user?.email || ""} ${item.title || ""} ${item.comment}`.toLowerCase().includes(q));
  }, [reviews, search]);

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">TRUST & COMMUNITY</p><h1>Review moderation</h1><p>Approve genuine customer feedback before it appears on the storefront.</p></div></div>
    {error && <p className="alert error">{error}</p>}
    <section className="admin-panel">
      <div className="admin-panel-head phase9-review-toolbar"><div><h2>{status === "pending" ? "Pending reviews" : "Approved reviews"}</h2><p>{filtered.length} review{filtered.length === 1 ? "" : "s"}</p></div><div className="admin-inline-actions"><button className={status === "pending" ? "state-toggle active" : "state-toggle"} onClick={() => setStatus("pending")}>Pending</button><button className={status === "approved" ? "state-toggle active" : "state-toggle"} onClick={() => setStatus("approved")}>Approved</button></div></div>
      <div className="admin-search-bar catalog-search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, customer or review" /></div>
      <div className="phase9-admin-review-list">
        {filtered.map((item) => <article className="phase9-admin-review-card" key={item.id}>
          <div className="phase9-review-meta"><span>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</span>{item.verifiedPurchase && <b>Verified purchase</b>}<small>{new Date(item.createdAt).toLocaleString()}</small></div>
          <h3>{item.product?.name}</h3>
          <strong>{item.title || "Customer review"}</strong>
          <p>{item.comment}</p>
          <small>{item.user?.firstName || "Customer"} · {item.user?.email}</small>
          <div className="admin-inline-actions phase9-review-actions">{status === "pending" ? <button className="state-toggle active" onClick={() => moderate(item.id, true)}>Approve</button> : <button className="state-toggle" onClick={() => moderate(item.id, false)}>Hide</button>}<button className="mini-danger" onClick={() => remove(item.id)}>Delete</button></div>
        </article>)}
        {!filtered.length && <div className="admin-empty">No reviews found.</div>}
      </div>
    </section>
  </>;
}

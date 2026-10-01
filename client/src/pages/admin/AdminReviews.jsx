import { useEffect, useMemo, useState } from "react";
import { apiFetch, mediaUrl } from "../../api/http";

export default function AdminReviews() {
  const [section, setSection] = useState("reviews");
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [answers, setAnswers] = useState({});

  async function load() {
    setError("");
    try {
      const path = section === "reviews"
        ? `/admin/reviews?status=${status}`
        : `/admin/product-questions?status=${status === "approved" ? "published" : "pending"}`;
      const response = await apiFetch(path);
      setItems(response.data || []);
      if (section === "questions") {
        setAnswers(Object.fromEntries((response.data || []).map((item) => [item.id, item.answer || ""])));
      }
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [section, status]);

  async function moderateReview(id, isApproved) {
    try {
      setSavingId(id);
      await apiFetch(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ isApproved }) });
      await load();
    } catch (e) { setError(e.message); } finally { setSavingId(""); }
  }

  async function removeReview(id) {
    if (!window.confirm("Delete this review permanently?")) return;
    try { await apiFetch(`/admin/reviews/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
  }

  async function saveQuestion(item, publish) {
    const answer = String(answers[item.id] || "").trim();
    if (publish && !answer) return setError("Add an answer before publishing the question.");
    try {
      setSavingId(item.id); setError("");
      await apiFetch(`/admin/product-questions/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ answer: answer || null, isPublished: publish }),
      });
      await load();
    } catch (e) { setError(e.message); } finally { setSavingId(""); }
  }

  async function removeQuestion(id) {
    if (!window.confirm("Delete this product question permanently?")) return;
    try { await apiFetch(`/admin/product-questions/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e.message); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = section === "reviews"
        ? `${item.product?.name || ""} ${item.user?.firstName || ""} ${item.user?.email || ""} ${item.title || ""} ${item.comment || ""}`
        : `${item.product?.name || ""} ${item.user?.firstName || ""} ${item.user?.email || ""} ${item.question || ""} ${item.answer || ""}`;
      return haystack.toLowerCase().includes(q);
    });
  }, [items, search, section]);

  return <>
    <div className="admin-page-heading"><div><p className="eyebrow">TRUST & COMMUNITY</p><h1>Reviews & product Q&amp;A</h1><p>Moderate visual reviews and answer customer product questions before they appear on the storefront.</p></div></div>
    {error && <p className="alert error">{error}</p>}

    <div className="phase22-admin-community-tabs" role="tablist" aria-label="Community moderation">
      <button className={section === "reviews" ? "active" : ""} onClick={() => { setSection("reviews"); setStatus("pending"); setSearch(""); }}>Reviews</button>
      <button className={section === "questions" ? "active" : ""} onClick={() => { setSection("questions"); setStatus("pending"); setSearch(""); }}>Product Q&amp;A</button>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-head phase9-review-toolbar">
        <div><h2>{status === "pending" ? `Pending ${section}` : `${section === "reviews" ? "Approved reviews" : "Published questions"}`}</h2><p>{filtered.length} item{filtered.length === 1 ? "" : "s"}</p></div>
        <div className="admin-inline-actions">
          <button className={status === "pending" ? "state-toggle active" : "state-toggle"} onClick={() => setStatus("pending")}>Pending</button>
          <button className={status === "approved" ? "state-toggle active" : "state-toggle"} onClick={() => setStatus("approved")}>{section === "reviews" ? "Approved" : "Published"}</button>
        </div>
      </div>
      <div className="admin-search-bar catalog-search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={section === "reviews" ? "Search product, customer or review" : "Search product, customer, question or answer"} /></div>

      {section === "reviews" ? <div className="phase9-admin-review-list">
        {filtered.map((item) => <article className="phase9-admin-review-card phase22-admin-review-card" key={item.id}>
          <div className="phase9-review-meta"><span>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</span>{item.verifiedPurchase && <b>Verified purchase</b>}<small>{new Date(item.createdAt).toLocaleString()}</small></div>
          <h3>{item.product?.name}</h3>
          <strong>{item.title || "Customer review"}</strong>
          <p>{item.comment}</p>
          {Array.isArray(item.images) && item.images.length > 0 && <div className="phase22-admin-review-media">{item.images.map((src, index) => <a key={`${src}-${index}`} href={mediaUrl(src)} target="_blank" rel="noreferrer"><img src={mediaUrl(src)} alt={`Review upload ${index + 1}`} /></a>)}</div>}
          <small>{item.user?.firstName || "Customer"} · {item.user?.email}</small>
          <div className="admin-inline-actions phase9-review-actions">{status === "pending" ? <button className="state-toggle active" disabled={savingId === item.id} onClick={() => moderateReview(item.id, true)}>Approve</button> : <button className="state-toggle" disabled={savingId === item.id} onClick={() => moderateReview(item.id, false)}>Hide</button>}<button className="mini-danger" onClick={() => removeReview(item.id)}>Delete</button></div>
        </article>)}
        {!filtered.length && <div className="admin-empty">No reviews found.</div>}
      </div> : <div className="phase22-admin-question-list">
        {filtered.map((item) => <article className="phase22-admin-question-card" key={item.id}>
          <div className="phase22-question-meta"><span>{item.product?.name}</span><small>{new Date(item.createdAt).toLocaleString()}</small></div>
          <h3>Q. {item.question}</h3>
          <small>{item.user?.firstName || "Customer"} · {item.user?.email}</small>
          <label>Riseora answer<textarea rows="4" value={answers[item.id] ?? item.answer ?? ""} onChange={(e) => setAnswers((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="Give a clear, product-specific answer. Avoid medical claims unless they are approved product facts." /></label>
          <div className="admin-inline-actions phase22-question-actions">
            {status === "pending" ? <><button className="button" disabled={savingId === item.id} onClick={() => saveQuestion(item, true)}>{savingId === item.id ? "Saving…" : "Save & publish"}</button><button className="button button-secondary" disabled={savingId === item.id} onClick={() => saveQuestion(item, false)}>Save draft</button></> : <><button className="button" disabled={savingId === item.id} onClick={() => saveQuestion(item, true)}>Update answer</button><button className="button button-secondary" disabled={savingId === item.id} onClick={() => saveQuestion(item, false)}>Unpublish</button></>}
            <button className="mini-danger" onClick={() => removeQuestion(item.id)}>Delete</button>
          </div>
        </article>)}
        {!filtered.length && <div className="admin-empty">No product questions found.</div>}
      </div>}
    </section>
  </>;
}

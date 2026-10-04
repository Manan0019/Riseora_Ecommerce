export default function SmartSearch({ intelligence, query = "", onSearch, compact = false }) {
  const didYouMean = String(intelligence?.didYouMean || "").trim();
  const relatedTerms = Array.isArray(intelligence?.relatedTerms) ? intelligence.relatedTerms.filter(Boolean).slice(0, compact ? 4 : 7) : [];
  if (!didYouMean && relatedTerms.length === 0) return null;

  return (
    <section className={compact ? "phase54-smart-search compact" : "phase54-smart-search"} aria-label="Smart search suggestions">
      {didYouMean && didYouMean.toLowerCase() !== String(query || "").trim().toLowerCase() && (
        <div className="phase54-correction">
          <span>Did you mean</span>
          <button type="button" onClick={() => onSearch?.(didYouMean)}>{didYouMean}</button>
        </div>
      )}
      {relatedTerms.length > 0 && (
        <div className="phase54-related-searches">
          <small>{didYouMean ? "RELATED SEARCHES" : "TRY SEARCHING"}</small>
          <div>{relatedTerms.map((term) => <button type="button" key={term} onClick={() => onSearch?.(term)}>{term}</button>)}</div>
        </div>
      )}
    </section>
  );
}

import { useMemo, useState } from "react";

function parseSelected(value) {
  return [...new Set(String(value || "").split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean))];
}

export default function SuitabilityPicker({ value, options = [], onChange, onAddOption }) {
  const selected = useMemo(() => parseSelected(value), [value]);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = options.filter((item) => !normalized || item.name.toLowerCase().includes(normalized));
  const exact = options.some((item) => item.name.toLowerCase() === normalized);

  function commit(next) { onChange?.(next.join("\n")); }
  function toggle(name) {
    commit(selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]);
  }
  async function addNew() {
    const name = query.trim();
    if (!name || exact) return;
    const added = await onAddOption?.(name);
    const actualName = added?.name || name;
    if (!selected.includes(actualName)) commit([...selected, actualName]);
    setQuery("");
  }

  return <div className="phase19-suitability-picker">
    <div className="phase19-suitability-chips">{options.map((item) => <button key={item.id || item.name} type="button" className={selected.includes(item.name) ? "active" : ""} onClick={() => toggle(item.name)}>{item.name}</button>)}</div>
    <div className="phase19-suitability-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search or type a new suitability" />{query.trim() && !exact && <button type="button" onClick={addNew}>+ Add “{query.trim()}”</button>}</div>
    {query && filtered.length > 0 && <div className="phase19-suitability-matches">{filtered.slice(0, 8).map((item) => <button type="button" key={item.id || item.name} onClick={() => { toggle(item.name); setQuery(""); }}>{selected.includes(item.name) ? "✓ " : "+ "}{item.name}</button>)}</div>}
    {selected.length > 0 && <small>Selected: {selected.join(" • ")}</small>}
  </div>;
}

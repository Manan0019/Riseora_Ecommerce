import { Link } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { useCompare } from "../context/CompareContext";
import { Icon } from "./Icons";

export default function CompareTray() {
  const { items, count, max, remove, clear } = useCompare();
  if (!count) return null;
  return <aside className="phase35-compare-tray" aria-label="Product comparison tray">
    <div className="phase35-compare-copy"><span>COMPARE</span><strong>{count} of {max} selected</strong></div>
    <div className="phase35-compare-mini-list">{items.map((item) => <div key={item.id}><span>{item.imageUrl ? <img src={mediaUrl(item.imageUrl)} alt="" /> : "R"}</span><small>{item.name}</small><button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name} from comparison`}><Icon name="close" size={13} /></button></div>)}</div>
    <div className="phase35-compare-actions"><button type="button" onClick={clear}>Clear</button><Link className={count < 2 ? "button disabled" : "button"} to={count < 2 ? "#" : "/compare"} aria-disabled={count < 2}>COMPARE {count >= 2 ? count : ""}</Link></div>
  </aside>;
}

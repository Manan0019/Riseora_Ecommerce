import { Link } from "react-router-dom";
import Seo from "../components/Seo";

export default function NotFound() {
  return <>
    <Seo title="Page not found | Riseora" noindex />
    <section className="container page-space phase47-notfound">
      <div className="phase47-notfound-code">404</div>
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>This page has wandered off.</h1>
      <p>The link may be old, or the page may have moved. Your cart and account are unchanged.</p>
      <div className="phase47-notfound-actions">
        <Link className="button" to="/shop">Shop products</Link>
        <Link className="button button-secondary" to="/">Back home</Link>
        <Link className="text-link" to="/help">Visit Help Center</Link>
      </div>
    </section>
  </>;
}

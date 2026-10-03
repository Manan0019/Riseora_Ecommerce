import React from "react";
import { reportClientError } from "../api/http";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, error };
  }

  componentDidCatch(error) {
    reportClientError({
      message: error?.message || "Unhandled storefront render error",
      route: window.location.pathname,
      source: "error-boundary",
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="phase47-fatal-shell" role="alert">
        <section className="phase47-fatal-card">
          <span className="eyebrow">RISEORA</span>
          <h1>We couldn't open this page.</h1>
          <p>Your cart and account are safe. Refresh once; if the problem continues, return to the storefront.</p>
          <div className="phase47-fatal-actions">
            <button className="button" type="button" onClick={() => window.location.reload()}>Refresh page</button>
            <a className="button button-secondary" href="/">Go to homepage</a>
          </div>
          <small>Reference time: {new Date().toLocaleString()}</small>
        </section>
      </main>
    );
  }
}

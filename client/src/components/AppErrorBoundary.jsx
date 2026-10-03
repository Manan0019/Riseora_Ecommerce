import React from "react";
import { reportClientError } from "../api/http";
import { createClientErrorReference, repairTransientClientState } from "../lib/client-runtime";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, error: null, referenceId: null };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, error, referenceId: createClientErrorReference() };
  }

  componentDidCatch(error, info) {
    const referenceId = this.state.referenceId || createClientErrorReference();
    if (import.meta.env.DEV) {
      console.error(`[Riseora ${referenceId}] storefront render error`, error, info?.componentStack || "");
    }
    reportClientError({
      message: error?.message || "Unhandled storefront render error",
      route: window.location.pathname,
      source: "error-boundary",
      referenceId,
    });
  }

  repairAndReload = () => {
    repairTransientClientState();
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    const referenceId = this.state.referenceId || "R52-UNKNOWN";
    return (
      <main className="phase47-fatal-shell" role="alert">
        <section className="phase47-fatal-card">
          <span className="eyebrow">RISEORA</span>
          <h1>We couldn't open this page.</h1>
          <p>Your cart and account are safe. Riseora recorded this browser error so it can be diagnosed without exposing private data.</p>
          {import.meta.env.DEV && this.state.error?.message && (
            <div className="phase50-dev-error"><strong>Development detail</strong><code>{String(this.state.error.message).slice(0, 500)}</code><small>React {React.version} · Phase 52 runtime guard active</small></div>
          )}
          <div className="phase47-fatal-actions">
            <button className="button" type="button" onClick={() => window.location.reload()}>Refresh page</button>
            <button className="button button-secondary" type="button" onClick={this.repairAndReload}>Repair local state</button>
            <a className="button button-secondary" href="/">Go to homepage</a>
          </div>
          <small>Error reference: {referenceId}</small>
        </section>
      </main>
    );
  }
}

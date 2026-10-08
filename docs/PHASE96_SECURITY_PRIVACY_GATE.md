# Security, privacy and payment readiness

Do not publish credentials or logs containing tokens, phone numbers, emails, order PII, OTP or payment provider secrets. Require HTTPS with HSTS configured at the TLS terminator, trusted reverse-proxy headers, restricted CORS, secure/session cookie settings, safe upload size/type validation, CSRF strategy appropriate to authentication, admin RBAC and audit history.

**Verify with real tests:** login throttling; password reset token single-use/expiry; session revocation; admin privilege boundaries; IDOR across order/return/support endpoints; customer-owned coupon and reward protections; webhook signature validation; replayed webhook idempotency; payment amount mismatch rejection; payment provider timeout; coupon discount reconciliation; stock reservation concurrency; batch recall shipment blocks; untrusted image/URL handling; content security policy (test and monitor before tightening); production source maps; no debugging endpoints exposed; backup access restriction.

Do not submit health data, purchase histories or customer communications to an external analytics/advertising system without consent and a documented lawful basis. Complete privacy/marketing opt-in handling and retention/deletion policy review.

Do not assume a passing npm audit means the application is secure. Dependency audits are only one layer. Document actual test evidence and human sign-off.

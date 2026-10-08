# Phase 97 — Database target fingerprint and environment protection

Phase 97 prevents accidental migration of the wrong database by comparing the intended production `DATABASE_URL` with the development reference and by requiring an explicit operator-reviewed `PHASE97_TARGET_FINGERPRINT`.

## Prepare without revealing secrets

1. Set `server/.env.production` with the intended production DB and private JWT/payment/email settings. Do not commit or upload this file.
2. From the full checkout run `npm run launch:env` and `npm run candidate:target`. The latter prints a 16-hex-character hash of hostname, port, DB name and schema, not a secret or connection URI.
3. Verify hostname/database/schema by viewing the configuration securely with a trusted operator (do not paste connection strings to ChatGPT).
4. Record the confirmed fingerprint as `PHASE97_TARGET_FINGERPRINT` inside `server/.env.production` and retain operator sign-off in private release evidence.
5. Before cutover, `release:prepare -- --execute --confirm=RISEORA-LIVE` re-runs the target guard with `--require-pin` and aborts before migration on a mismatch.

Production and development DBs must never share the same host+port+DB+schema identity. If your server itself runs PostgreSQL on localhost, `candidate:target` requires the explicit `--allow-local` CLI override (and an off-host backup review); the guarded production cutover intentionally does not supply that override automatically.

For a managed provider's pooled vs direct DB URL that uses different hostnames, the default guard blocks because it cannot independently prove the same logical DB. Do NOT disable this silently; have the provider/DB owner prove and document exact correspondence before adjusting policy.

For a fresh production host with no developer `.env`, `candidate:target` may be invoked with `--no-dev-reference` only after independently reviewing the destination; direct target pinning is still required during actual cutover.

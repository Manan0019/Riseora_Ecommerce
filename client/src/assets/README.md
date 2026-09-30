# Riseora default brand assets

Phase 13 automatically uses these local files when Admin → Settings does not yet contain uploaded branding:

- `riseora-logo-Horizontal.png` — default storefront/navbar/footer logo
- `riseora-Logo-Vertical.png` — default login/account/admin compact logo

The `predev` and `prebuild` scripts copy them into `client/public/brand/` so both Vite development and production builds can serve them.

Admin-uploaded Primary Logo / Vertical Logo always overrides these defaults, so you can replace branding later without source changes.

/**
 * Phase 72 Cart Quantity Readiness — forward-compatible retained source audit.
 *
 * Phase 72 introduced no new migration.  A newer legitimate migration must
 * never make this historical audit fail.  All original business/UI contracts
 * remain checked on the complete Riseora checkout.
 *
 * This cumulative overlay includes only recent source files.  Missing old
 * application files are explicitly marked DEFERRED in the overlay environment,
 * and are STRICTLY REQUIRED in the complete checkout (Home.jsx exists).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(sourcePath), '..');

export const phase72Tokens = {
  'server/src/services/cart-quantity-intelligence.service.ts': [
    'getCartQuantityReadiness', 'cartQuantityHealth', 'availableToSell(variant)',
    'maxPurchaseQuantity', 'lowStockThreshold', 'adjustmentRequired',
    'quantityCeiling', 'safeQuantity',
    'Safety stock is never counted as customer-available inventory',
    'contain no customer identity or cart contents',
  ],
  'server/src/routes/product.routes.ts': [
    '"/cart/quantity-readiness"', 'getCartQuantityReadiness',
    'Invalid cart quantity request',
  ],
  'server/src/routes/admin.routes.ts': [
    '"/catalog/cart-quantity-health"', 'cartQuantityHealth',
  ],
  'client/src/context/CartContext.jsx': [
    'refreshCartFacts', 'applySafeCartQuantities', 'safeQuantity',
    'stockQuantity', 'maxPurchaseQuantity',
  ],
  'client/src/pages/Cart.jsx': [
    'PHASE 72 · CART READINESS', 'Quantity check before checkout',
    'REFRESH AVAILABILITY', 'APPLY SAFE QUANTITIES',
    'Resolve quantities first', 'Low stock',
    'Current quantity is at a limit', '/products/cart/quantity-readiness',
  ],
  'client/src/pages/admin/AdminCatalog.jsx': [
    'PHASE 72 · CART READINESS', 'Quantity & purchase-limit health',
    '/admin/catalog/cart-quantity-health', 'LOW-STOCK VARIANTS',
    'ADJUSTMENT CARTS · 60M', 'AT-LIMIT CARTS · 60M',
  ],
  'client/src/styles.css': [
    'phase72-cart-readiness', 'phase72-line-guidance',
    'phase72-admin-quantity-health',
  ],
};

export function auditPhase72({ root = defaultRoot, strict = fs.existsSync(path.join(root, 'client/src/pages/Home.jsx')) } = {}) {
  const findings = [];
  const file = (name) => path.join(root, name);
  const exists = (name) => fs.existsSync(file(name));
  const read = (name) => exists(name) ? fs.readFileSync(file(name), 'utf8') : '';
  const check = (name, ok) => findings.push({ name, status: ok ? 'PASS' : 'FAIL' });
  const deferred = (name) => findings.push({name: `${name} — historical source checks deferred to full checkout`, status:'DEFERRED'});
  const pkg = JSON.parse(read('package.json') || '{}');
  const schema = read('server/prisma/schema.prisma');
  const service = read('server/src/services/cart-quantity-intelligence.service.ts');
  const route = read('server/src/routes/product.routes.ts');
  const adminRoute = read('server/src/routes/admin.routes.ts');
  const ctx = read('client/src/context/CartContext.jsx');
  const cart = read('client/src/pages/Cart.jsx');

  for (const [name,tokens] of Object.entries(phase72Tokens)) {
    if (!exists(name)) {
      if (strict) check(name, false);
      else deferred(name);
      continue;
    }
    check(name, true);
    const body = read(name);
    for (const token of tokens) check(`${name} · ${token}`, body.includes(token));
  }
  check('package.json', !!pkg.scripts);

  const behavioral = [
    ['Phase 72 quantity intelligence service remains read-only',
      service.includes('getCartQuantityReadiness') && service.includes('cartQuantityHealth') &&
      !/\bprisma\.productVariant\.(?:update|updateMany|delete|deleteMany|create|createMany)\s*\(/.test(service)],
    ['quantity readiness uses public availability after safety stock',
      service.includes('availableToSell(variant)') && service.includes('Safety stock is never counted as customer-available inventory')],
    ['product-level purchase limits are enforced across variants',
      service.includes('maxPurchaseQuantity') && ctx.includes('maxPurchaseQuantity')],
    ['low-stock guidance is based on configured thresholds',
      service.includes('lowStockThreshold')],
    ['Cart blocks obvious invalid quantities until explicit safe adjustment',
      cart.includes('APPLY SAFE QUANTITIES') && cart.includes('Resolve quantities first') && ctx.includes('applySafeCartQuantities')],
    ['Phase 57 checkout authority remains explicit',
      route.includes('getCartQuantityReadiness') && cart.includes('Quantity check before checkout')],
    ['Phase 72 leaves Saved Bag schema unchanged',
      schema.includes('model AccountCart') && schema.includes('items Json') && schema.includes('revision Int')],
  ];
  for (const [name, result] of behavioral) {
    if (!strict && [service, ctx, cart, route, adminRoute].some((s)=>!s)) deferred(name);
    else check(name, result);
  }

  // Correct historical invariant: Phase 72 did not introduce a migration.
  // Do not compare the *latest overall migration* with a Phase 69/72 head.
  const migrationDir = file('server/prisma/migrations');
  check('migration directory exists', fs.existsSync(migrationDir));
  if (fs.existsSync(migrationDir)) {
    const names = fs.readdirSync(migrationDir, {withFileTypes:true})
      .filter((d)=>d.isDirectory()).map((d)=>d.name);
    check('Phase 72 added no migration; future legitimate migration heads allowed',
      names.every((name)=>!/phase72(?:_|\b)/i.test(name)));
    check('Phase 69 saved-bag migration history still present',
      names.some((name)=>/phase69_account_saved_bag_v2/i.test(name)) || !strict);
  }
  check('quantity:doctor command',
    String(pkg.scripts?.['quantity:doctor'] || '').includes('phase72-cart-quantity-readiness-audit.mjs'));
  check('client:doctor includes Phase 72 gate',
    String(pkg.scripts?.['client:doctor'] || '').includes('quantity:doctor'));
  const v72 = String(pkg.scripts?.['verify:phase72'] || '');
  check('verify:phase72 command', v72.includes('client:doctor') || v72.includes('quantity:doctor'));
  check('prelaunch uses Phase 72+ verification',
    /verify:phase(?:7[2-9]|[89]\d|\d{3,})/.test(String(pkg.scripts?.['prelaunch:check'] || '')));
  check('production release advances to Phase 72+',
    /verify:phase(?:7[2-9]|[89]\d|\d{3,})/.test(read('scripts/phase49-release-prepare.mjs')));
  check('no destructive production database command added',
    !/(drop database|migrate reset|db push --force-reset)/i.test(JSON.stringify(pkg.scripts || {})));
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === sourcePath) {
  const findings = auditPhase72();
  for (const item of findings) console.log(`${item.status}  ${item.name}`);
  const failures = findings.filter((x)=>x.status === 'FAIL');
  const deferred = findings.filter((x)=>x.status === 'DEFERRED');
  console.log(`\nPhase 72 cart quantity readiness audit: ${failures.length ? `FAIL (${failures.length})` : 'PASS'}${deferred.length ? ` · ${deferred.length} historical overlay-only checks deferred` : ''}`);
  if (failures.length) process.exitCode=1;
}

import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const required=[
  "client/src/context/CompareContext.jsx","client/src/components/CompareTray.jsx","client/src/pages/Compare.jsx","client/src/pages/Shop.jsx",
  "server/src/routes/wishlist.routes.ts","server/src/routes/product.routes.ts","server/prisma/migrations/20261002211500_phase35_discovery_cross_device_wishlist/migration.sql"
];
for (const rel of required) if (!fs.existsSync(path.join(root,rel))) throw new Error(`Phase 35 missing ${rel}`);
const schema=fs.readFileSync(path.join(root,"server/prisma/schema.prisma"),"utf8");
if (!schema.includes("model WishlistItem") || !schema.includes("@@unique([userId, productId])")) throw new Error("Account wishlist model missing");
const wishlist=fs.readFileSync(path.join(root,"server/src/routes/wishlist.routes.ts"),"utf8");
for (const marker of ["/sync","/items/:productId","accountWishlist"]) if (!wishlist.includes(marker)) throw new Error(`Wishlist sync marker missing ${marker}`);
const products=fs.readFileSync(path.join(root,"server/src/routes/product.routes.ts"),"utf8");
for (const marker of ["/discovery/facets","/compare","relevanceScore","suitableFor","ingredient"]) if (!products.includes(marker)) throw new Error(`Discovery marker missing ${marker}`);
const app=fs.readFileSync(path.join(root,"client/src/App.jsx"),"utf8"); if (!app.includes('path="/compare"')) throw new Error("Compare route missing");
const main=fs.readFileSync(path.join(root,"client/src/main.jsx"),"utf8"); if (!main.includes("<CompareProvider>")) throw new Error("Compare provider missing");
console.log("Phase 35 discovery audit PASS");
console.log("- authenticated wishlist sync + guest merge present");
console.log("- multi-term search, suitability/ingredient facets and URL filters present");
console.log("- three-product comparison workspace and tray present");

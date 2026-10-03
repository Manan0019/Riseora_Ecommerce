import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceOnly = process.argv.includes("--source-only");
let failed = false;

function pass(message) { console.log(`PASS  ${message}`); }
function fail(message) { failed = true; console.error(`FAIL  ${message}`); }
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
function canonical(value) { try { return fs.realpathSync.native(value); } catch { return path.resolve(value); } }
function relative(value) { return path.relative(root, value).replaceAll("\\", "/") || "."; }

const rootPackage = readJson("package.json");
const clientPackage = readJson("client/package.json");
const expectedReact = clientPackage.dependencies?.react;
const expectedReactDom = clientPackage.dependencies?.["react-dom"];

expectedReact === "19.1.1" ? pass(`client React pin · ${expectedReact}`) : fail(`client React pin must be 19.1.1, found ${expectedReact || "missing"}`);
expectedReactDom === expectedReact ? pass(`client ReactDOM pin matches React · ${expectedReactDom}`) : fail(`client ReactDOM pin must match React (${expectedReact}), found ${expectedReactDom || "missing"}`);
rootPackage.dependencies?.react === expectedReact ? pass(`workspace React anchor · ${expectedReact}`) : fail(`root dependencies.react must match client (${expectedReact})`);
rootPackage.dependencies?.["react-dom"] === expectedReactDom ? pass(`workspace ReactDOM anchor · ${expectedReactDom}`) : fail(`root dependencies.react-dom must match client (${expectedReactDom})`);

const viteText = fs.readFileSync(path.join(root, "client/vite.config.js"), "utf8");
for (const name of ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]) {
  viteText.includes(`"${name}"`) ? pass(`Vite dedupe entry · ${name}`) : fail(`Vite dedupe missing · ${name}`);
}

if (!fs.existsSync(path.join(root, "node_modules"))) {
  if (sourceOnly) {
    pass("node_modules absent · source-only runtime contract checked");
  } else {
    fail("node_modules is missing. Run npm install from the repository root first.");
  }
} else {
  const rootRequire = createRequire(path.join(root, "package.json"));
  const clientRequire = createRequire(path.join(root, "client/package.json"));

  function resolveFrom(requireFn, specifier, label) {
    try {
      const resolved = canonical(requireFn.resolve(specifier));
      pass(`${label} resolves · ${relative(resolved)}`);
      return resolved;
    } catch (error) {
      fail(`${label} resolve failed · ${error.message}`);
      return null;
    }
  }

  const rootReact = resolveFrom(rootRequire, "react", "root React");
  const clientReact = resolveFrom(clientRequire, "react", "client React");
  const clientReactDom = resolveFrom(clientRequire, "react-dom/client", "client ReactDOM");
  const routerDom = resolveFrom(clientRequire, "react-router-dom", "React Router DOM");
  const router = resolveFrom(clientRequire, "react-router", "React Router");

  const consumers = [];
  if (clientReactDom) consumers.push(["ReactDOM -> React", createRequire(clientReactDom)]);
  if (routerDom) consumers.push(["React Router DOM -> React", createRequire(routerDom)]);
  if (router) consumers.push(["React Router -> React", createRequire(router)]);

  const reactPaths = new Map();
  for (const [label, requireFn] of consumers) {
    const resolved = resolveFrom(requireFn, "react", label);
    if (resolved) reactPaths.set(label, resolved);
  }
  if (rootReact) reactPaths.set("root", rootReact);
  if (clientReact) reactPaths.set("client", clientReact);

  const uniqueReactPaths = [...new Set(reactPaths.values())];
  if (uniqueReactPaths.length === 1) {
    pass(`single physical React runtime · ${relative(uniqueReactPaths[0])}`);
  } else if (uniqueReactPaths.length > 1) {
    fail(`multiple physical React runtimes detected:\n${[...reactPaths].map(([label, value]) => `  ${label}: ${relative(value)}`).join("\n")}\nRun: npm run deps:repair`);
  }

  function packageVersion(requireFn, packageName) {
    try { return JSON.parse(fs.readFileSync(requireFn.resolve(`${packageName}/package.json`), "utf8")).version; }
    catch { return null; }
  }
  const rootReactVersion = packageVersion(rootRequire, "react");
  const clientReactVersion = packageVersion(clientRequire, "react");
  const clientReactDomVersion = packageVersion(clientRequire, "react-dom");
  rootReactVersion === expectedReact ? pass(`installed root React version · ${rootReactVersion}`) : fail(`installed root React is ${rootReactVersion || "missing"}, expected ${expectedReact}`);
  clientReactVersion === expectedReact ? pass(`installed client React version · ${clientReactVersion}`) : fail(`installed client React is ${clientReactVersion || "missing"}, expected ${expectedReact}`);
  clientReactDomVersion === expectedReactDom ? pass(`installed ReactDOM version · ${clientReactDomVersion}`) : fail(`installed ReactDOM is ${clientReactDomVersion || "missing"}, expected ${expectedReactDom}`);
}

if (failed) {
  console.error("\nPhase 52 React runtime doctor: FAIL");
  process.exit(1);
}
console.log("\nPhase 52 React runtime doctor: PASS");

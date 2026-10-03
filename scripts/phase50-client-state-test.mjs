import assert from "node:assert/strict";
import { readPersistedArray, writePersistedArray, quarantinePrefix } from "../client/src/lib/persisted-state.js";

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
  keys() { return [...this.#data.keys()]; }
}

const storage = new MemoryStorage();
storage.setItem("valid", JSON.stringify([{ id: 1 }, { id: 2 }]));
assert.deepEqual(readPersistedArray(storage, "valid", { maxItems: 10 }), [{ id: 1 }, { id: 2 }]);

storage.setItem("object", JSON.stringify({ items: [1, 2] }));
assert.deepEqual(readPersistedArray(storage, "object"), []);
assert.equal(storage.getItem("object"), null);
assert.ok(storage.getItem(`${quarantinePrefix()}object`));

storage.setItem("broken", "{not-json");
assert.deepEqual(readPersistedArray(storage, "broken"), []);
assert.equal(storage.getItem("broken"), null);

storage.setItem("guarded", JSON.stringify([{ id: 1 }, null, { nope: true }, { id: 2 }]));
assert.deepEqual(readPersistedArray(storage, "guarded", { itemGuard: (item) => Boolean(item?.id) }), [{ id: 1 }, { id: 2 }]);
assert.deepEqual(JSON.parse(storage.getItem("guarded")), [{ id: 1 }, { id: 2 }]);

assert.deepEqual(writePersistedArray(storage, "limited", [1, 2, 3, 4], { maxItems: 2 }), [1, 2]);
assert.deepEqual(JSON.parse(storage.getItem("limited")), [1, 2]);

console.log("PASS  malformed persisted state is quarantined");
console.log("PASS  valid persisted arrays are preserved");
console.log("PASS  per-key item guards repair invalid entries");
console.log("PASS  persisted state item limits are enforced");
console.log("\nPhase 50 client-state recovery test: PASS");

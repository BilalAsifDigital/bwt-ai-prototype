// In-memory stand-in for @netlify/blobs, covering what this app uses.
// Loaded in place of the real module by test/stub-server.mjs.
const stores = new Map();

export function getStore(name) {
  const key = typeof name === "string" ? name : name.name;
  if (!stores.has(key)) stores.set(key, new Map());
  const m = stores.get(key);
  return {
    async get(k, opts = {}) {
      if (!m.has(k)) return null;
      const raw = m.get(k);
      return opts.type === "json" ? JSON.parse(raw) : raw;
    },
    async set(k, v) { m.set(k, String(v)); },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list() { return { blobs: [...m.keys()].map((k) => ({ key: k })) }; },
  };
}

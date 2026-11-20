import assert from "node:assert/strict"
const target = new URL(process.env.CASKU_TEST_CALENDLY_URL)
assert.equal(target.protocol, "http:"); assert.equal(target.hostname, "127.0.0.1")
assert.equal(process.env.CALENDLY_API_TOKEN, "calendly_fixture_only")
assert(process.env.CASKU_PRODUCTION_TEST === "1" || process.env.CASKU_TEST_MODE === "1")
const original = globalThis.fetch
// Explicit --import in tests only; no configurable provider URL in application code.
globalThis.fetch = function(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.origin === "https://api.calendly.com") {
    assert.equal(init?.method, "GET")
    return original(new URL(url.pathname + url.search, target), init)
  }
  return original(input, init)
}

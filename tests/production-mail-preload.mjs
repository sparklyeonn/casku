import assert from "node:assert/strict"
const target = new URL(process.env.CASKU_TEST_MAIL_URL)
assert.equal(process.env.CASKU_PRODUCTION_TEST, "1")
assert.equal(process.env.NODE_ENV, "production")
assert.equal(target.protocol, "http:")
assert.equal(target.hostname, "127.0.0.1")
assert.equal(process.env.BREVO_API_KEY, "brevo_local_test_only")
const originalFetch = globalThis.fetch
// Only the test runner passes --import for this module. The application keeps its production mail safeguards.
globalThis.fetch = function(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
  if (url.origin === "https://api.brevo.com" && url.pathname === "/v3/smtp/email") {
    const destination = new URL(url.pathname + url.search, target)
    return originalFetch(input instanceof Request ? new Request(destination, input) : destination, init)
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Red externa bloqueada en la prueba de producción")
  return originalFetch(input, init)
}

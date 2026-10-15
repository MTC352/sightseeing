import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/dmc-inquiry.js")
const { validateDmcInquiry, dmcInquirySummary } = mod.default ?? mod

const valid = {
  purpose: "Group tour", name: "  Ana Silva ", email: "ana@agency.com", phone: "+352 621 123 456",
  destination: "WWII history", company: "Agency", website: "https://agency.com", message: "40 guests in May",
}

test("accepts a complete enquiry and trims values", () => {
  const r = validateDmcInquiry(valid)
  assert.equal(r.ok, true)
  assert.equal(r.data.name, "Ana Silva")
})

test("optional fields may be empty", () => {
  const r = validateDmcInquiry({ ...valid, phone: "", destination: "", company: "", website: "" })
  assert.equal(r.ok, true)
})

test("reports every invalid field", () => {
  const r = validateDmcInquiry({ purpose: "Hacking", name: "", email: "nope", phone: "call me", destination: "Mars", website: "agency.com", message: "" })
  assert.equal(r.ok, false)
  assert.deepEqual([...r.errors].sort(), ["destination", "email", "message", "name", "phone", "purpose", "website"])
})

test("rejects header-injection style emails", () => {
  assert.equal(validateDmcInquiry({ ...valid, email: "a@b.com\r\nBcc: x@y.com" }).ok, false)
  assert.equal(validateDmcInquiry({ ...valid, email: "a@b.com,c@d.com" }).ok, false)
})

test("caps the message at 2000 characters", () => {
  const r = validateDmcInquiry({ ...valid, message: "x".repeat(5000) })
  assert.equal(r.ok, true)
  assert.equal(r.data.message.length, 2000)
})

test("summary lists every field, dash for empty ones", () => {
  const r = validateDmcInquiry({ ...valid, phone: "" })
  const s = dmcInquirySummary(r.data)
  assert.match(s, /Purpose:\s+Group tour/)
  assert.match(s, /Phone:\s+—/)
  assert.match(s, /40 guests in May/)
})

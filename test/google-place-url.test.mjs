import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/google-place-url.js")
const extractPlaceId = mod.extractPlaceId ?? mod.default?.extractPlaceId
const extractPlaceName = mod.extractPlaceName ?? mod.default?.extractPlaceName
const extractPlaceCoords = mod.extractPlaceCoords ?? mod.default?.extractPlaceCoords

// The real URL from the "City Tour Hop on Hop off" business. Modern Google Maps
// place URLs embed a hex feature-id / CID in the `!1s` token — NOT a `ChIJ…`
// Places API place_id — plus the precise pin in `!3d…!4d…`.
const HEX_URL =
  "https://www.google.com/maps/place/City+Tour+Hop+on+Hop+off/@49.6106231,5.8250349,47891m/" +
  "data=!3m1!1e3!4m6!3m5!1s0x47954935a8bf2745:0x273f12336635181f!8m2!3d49.607646!4d6.128557!" +
  "16s%2Fg%2F11jsb7_h50?entry=ttu&g_ep=EgoyMDI2MDgyNC4wIKXMDSoASAFQAw%3D%3D"

test("does NOT return the hex feature-id/CID from the !1s token as a place_id", () => {
  // This is the core bug: the `0x…:0x…` hex is not a valid Places API place_id.
  assert.equal(extractPlaceId(HEX_URL), null)
})

test("returns a raw ChIJ… place id pasted directly", () => {
  assert.equal(extractPlaceId("ChIJ85BI1wLFlEcRJpsBgCkl8gA"), "ChIJ85BI1wLFlEcRJpsBgCkl8gA")
})

test("returns a real place_id from the !1s token when it is a ChIJ id", () => {
  const url = "https://www.google.com/maps/place/X/@1,2,15z/data=!3m1!4b1!4m2!1sChIJ85BI1wLFlEcRJpsBgCkl8gA!8m2"
  assert.equal(extractPlaceId(url), "ChIJ85BI1wLFlEcRJpsBgCkl8gA")
})

test("returns null for a bare business name (not a place id)", () => {
  assert.equal(extractPlaceId("City Tour Hop on Hop off"), null)
})

test("extracts the business name from the /place/ path segment", () => {
  assert.equal(extractPlaceName(HEX_URL), "City Tour Hop on Hop off")
})

test("prefers the precise !3d!4d pin over the @-viewport coordinates", () => {
  assert.deepEqual(extractPlaceCoords(HEX_URL), { lat: 49.607646, lng: 6.128557 })
})

test("falls back to @lat,lng when there is no !3d!4d pin", () => {
  const url = "https://www.google.com/maps/place/X/@49.6106231,5.8250349,12z"
  assert.deepEqual(extractPlaceCoords(url), { lat: 49.6106231, lng: 5.8250349 })
})

test("returns null coords for a URL with no coordinates", () => {
  assert.equal(extractPlaceCoords("https://maps.app.goo.gl/abc123"), null)
})

---
name: Regiondo (DMO) 403 + single sync
description: Why Regiondo test-key returns 403 (account-side, not a signing bug) and how single-trip sync mirrors Palisis.
---

# Regiondo 403 is account-side, not a code/signing bug

The HMAC-SHA256 signing is VERIFIED correct against Regiondo's official
`regiondo-dev/api` reference client: `stringToSign = timestamp_ms + publicKey +
queryString` (the query string signed must byte-for-byte equal the query sent on
the wire), headers `X-API-ID` / `X-API-TIME` / `X-API-HASH` / `Accept-Language`.

**Symptom that proves it's account-side, not code:** ANY request with a
recognized `X-API-ID` returns **403 with an empty body**, across every signing
permutation (ms vs sec timestamp, prod `api.regiondo.com/v1` vs sandbox
`sandbox-api.regiondo.com/v1`), even the MINIMAL `/categories` call with an empty
query string. A 403 on the minimal signed request can't be a query-string/encoding
bug — the key pair is rejected on the Regiondo account side. (`api.regiondo.de` is
NOT an API host — it returns storefront 404 HTML.)

**The secret is a PLAIN UTF-8 STRING key — do NOT expect it to be hex.** All four
official `regiondo-dev/api` reference clients (JS Postman, PHP, Java, C#) feed the
secret straight into HMAC as UTF-8 bytes: PHP `hash_hmac('sha256',msg,secret)`,
Java `new SecretKeySpec(key.getBytes("UTF-8"),...)`, JS `CryptoJS.HmacSHA256(msg,
secret)`. Node `createHmac("sha256",secret)` is byte-identical. **A prior session's
"valid secret = even-length hex" claim was WRONG** — secret length/charset is not a
validity signal. (Observed non-working pair: public `MO…` 14 chars, secret 37 chars.)

**Why:** signing is provably correct and was empirically exhausted (live 403 on
both hosts); don't re-chase it in code.

**How to apply:** when Regiondo 403s, do NOT touch signing. Tell the user the keys
are rejected account-side — regenerate the key pair in the Regiondo Dashboard,
enable API access, confirm whether they are sandbox vs production keys (set the
DB-configurable `regiondoApiUrl` to the sandbox host for sandbox keys), and check
whether the Regiondo account requires IP-allowlisting the calling server.

# Single-trip sync mirrors Palisis

`lib/regiondo-sync.ts` `syncSingleTripFromRegiondo` mirrors `lib/palisis-sync.ts`:
re-fetch detail + variations + options, override our DB row (ONE-WAY, static-
only), log a detailed `regiondo_sync_log` row on success AND failure. Shared
`app/admin/trips/trip-sync-button.tsx` switches source by which id prop is passed
(`palisisId` vs `regiondoId`).

**Gotcha:** `dbGetTrip` (TRIP_SELECT) aliases the column as camelCase
`regiondoId`, but `dbListRegiondoTrips` returns snake `regiondo_id`. Use the
right one per query or the edit-page DMO button silently won't render.

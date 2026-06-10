---
name: Regiondo (DMO) 403 + single sync
description: Why Regiondo test-key returns 403 (account-side, not a signing bug) and how single-trip sync mirrors Palisis.
---

# Regiondo 403 is account-side, not a code/signing bug

The HMAC-SHA256 signing is VERIFIED correct against Regiondo's official
`regiondo-dev/api` reference client: `stringToSign = timestamp_ms + publicKey +
queryString` (the query string signed must byte-for-byte equal the query sent on
the wire), headers `X-API-ID` / `X-API-TIME` / `X-API-HASH` / `Accept-Language`.

**Symptom that proves it's account-side, not code:** a no-auth request returns
**401 JSON** `{"code":401}`; ANY request with a recognized `X-API-ID` returns
**403 with an empty body**, across every signing permutation (ms vs sec
timestamp, key order, swapped keys, prod vs sandbox host). Recognized-but-
forbidden ⇒ the key pair is rejected on the Regiondo account side, not a bug.

**Fastest credential diagnostic:** a valid Regiondo secret is **even-length
hex**. A saved secret that is odd-length or non-hex is truncated/mis-pasted and
will ALWAYS 403. The admin Test modal surfaces `secretKey_length`,
`secretKey_isEvenLengthHex`, and a non-reversible SHA-256 fingerprint of each key
(never the raw secret) so the admin can compare against their working app.

**Why:** signing was empirically exhausted before confirming it was
credential/account-side; don't re-chase it in code. Tell the user to regenerate
the key pair and enable API access (Regiondo Dashboard → Connectivity → API
Configuration).

**How to apply:** when Regiondo 403s, check the secret is even-length hex and the
fingerprint matches the working key before touching any signing code.

# Single-trip sync mirrors Palisis

`lib/regiondo-sync.ts` `syncSingleTripFromRegiondo` mirrors `lib/palisis-sync.ts`:
re-fetch detail + variations + options, override our DB row (ONE-WAY, static-
only), log a detailed `regiondo_sync_log` row on success AND failure. Shared
`app/admin/trips/trip-sync-button.tsx` switches source by which id prop is passed
(`palisisId` vs `regiondoId`).

**Gotcha:** `dbGetTrip` (TRIP_SELECT) aliases the column as camelCase
`regiondoId`, but `dbListRegiondoTrips` returns snake `regiondo_id`. Use the
right one per query or the edit-page DMO button silently won't render.

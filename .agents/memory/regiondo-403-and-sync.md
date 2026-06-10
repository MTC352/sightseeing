---
name: Regiondo (DMO) 403 + single sync
description: Why Regiondo test-key returns 403 (account-side, not a signing bug) and how single-trip sync mirrors Palisis.
---

# Regiondo 403 is account-side, not a code/signing bug

The signing in `lib/regiondo.ts` `buildHeaders` (`stringToSign = timestamp_ms +
publicKey + queryString`, HMAC-SHA256 hex; headers X-API-ID / X-API-TIME /
X-API-HASH / Accept-Language) is VERIFIED correct against Regiondo's official
`regiondo-dev/api` reference client.

**Symptom:** no-auth request → 401 JSON `{"code":401}`; ANY request with a
recognized X-API-ID → **403 empty body**, across every permutation (ms vs
seconds timestamp, key order, swapped keys, with/without User-Agent, prod
`api.regiondo.com/v1` AND `sandbox-api.regiondo.com/v1`).

**Conclusion:** keys are recognized but forbidden ⇒ the key pair is being
rejected on the Regiondo account side (mismatched/mis-copied pair, or API
access not enabled in Regiondo Dashboard → Connectivity → API Configuration).
**Do not chase this in code.** Tell the user to regenerate keys + enable API
access. `pingRegiondo` surfaces `httpStatus`; the test-key route gives a
403-specific actionable message.

**Why:** burned a whole session empirically testing signing permutations before
confirming it was credential/account-side.

# Single-trip sync mirrors Palisis

`lib/regiondo-sync.ts` `syncSingleTripFromRegiondo(regiondoId, trigger)` mirrors
`lib/palisis-sync.ts`: re-fetch detail + variations + options, override our DB
row (ONE-WAY, static-only), log a detailed `regiondo_sync_log` row (action
`single_sync`) on success AND failure. For single sync there's no list summary,
so synthesize `summary = { product_id: regiondoId }` and rely on the detail
endpoint. Shared `app/admin/trips/trip-sync-button.tsx` switches source by which
id prop is passed (`palisisId` vs `regiondoId`).

**Gotcha:** `dbGetTrip` (TRIP_SELECT) aliases the column as camelCase
`regiondoId`, but `dbListRegiondoTrips` returns snake `regiondo_id`. Use the
right one per query or the edit-page DMO button silently won't render.

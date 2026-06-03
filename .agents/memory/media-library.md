---
name: Media library & site doc slots
description: Admin Files media library + how uploaded files get wired into site doc slots (e.g. footer Terms of Service)
---

# Media library (admin "Files")

- Table `media_files`; admin CRUD under `/api/admin/media` (+ `[id]`), UI at `/admin/files`, RBAC permission key `files`.
- Upload reuses the trips-upload pattern: Vercel Blob when `BLOB_READ_WRITE_TOKEN` set, else writes `public/uploads/` (not durable on autoscale — acceptable, matches existing pattern).
- **SVG and any active-content MIME are deliberately excluded** from the upload allow-list — served same-origin from /uploads they are a stored-XSS vector.

# Site document slots (footer Terms of Service)

- An uploaded file can be assigned to a "doc slot" stored in `integrations` (key `terms_of_service`, value = JSON `{mediaId,url,filename}`).
- Admin assign/clear: `PUT /api/admin/site-documents` ({mediaId|null}); public read: `GET /api/legal-documents` returns ONLY `{termsOfService:url|null}`. Footer (`components/site-footer.tsx`) fetches it and overrides the "Terms & Conditions" link.
- **Rule:** any media→integration doc reference must be (1) cleared server-side in the media DELETE route when the assigned file is removed, AND (2) null-validated on the public read (re-fetch media by id; return null if gone).
  **Why:** client-only clearing leaves a stale integration row, so the public footer keeps linking to a deleted file across refreshes/sessions.

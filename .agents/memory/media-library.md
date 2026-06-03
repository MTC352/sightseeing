---
name: Media library
description: Admin Files media library — upload/share files
---

# Media library (admin "Files")

- Table `media_files`; admin CRUD under `/api/admin/media` (+ `[id]`), UI at `/admin/files`, RBAC permission key `files`.
- Upload reuses the trips-upload pattern: Vercel Blob when `BLOB_READ_WRITE_TOKEN` set, else writes `public/uploads/` (not durable on autoscale — acceptable, matches existing pattern).
- **SVG and any active-content MIME are deliberately excluded** from the upload allow-list — served same-origin from /uploads they are a stored-XSS vector.

import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/ticket-attachment-rules.js")
const {
  validateTicketFiles, mimeForExtension, isInlineMimeType, isSafeStorageKey,
  contentDisposition, cleanFilename, fileExtension, TICKET_ATTACHMENT_MAX_FILES,
} = mod.default ?? mod

const pdf = { name: "invoice.pdf", type: "application/pdf", size: 1000 }

test("accepts pdf, images and office docs", () => {
  assert.deepEqual(validateTicketFiles([pdf]), { ok: true })
  assert.deepEqual(validateTicketFiles([{ name: "a.JPG", type: "image/jpeg", size: 5 }, { name: "b.docx", type: "", size: 5 }]), { ok: true })
  assert.deepEqual(validateTicketFiles([]), { ok: true })
})

test("rejects active content, mismatched MIME, empty, oversize and too many files", () => {
  assert.equal(validateTicketFiles([{ name: "x.svg", type: "image/svg+xml", size: 5 }]).ok, false)
  assert.equal(validateTicketFiles([{ name: "x.html", type: "text/html", size: 5 }]).ok, false)
  assert.equal(validateTicketFiles([{ name: "x.pdf", type: "text/html", size: 5 }]).ok, false)
  assert.equal(validateTicketFiles([{ name: "noext", type: "", size: 5 }]).ok, false)
  assert.equal(validateTicketFiles([{ ...pdf, size: 0 }]).ok, false)
  assert.equal(validateTicketFiles([{ ...pdf, size: 10 * 1024 * 1024 + 1 }]).ok, false)
  assert.equal(validateTicketFiles(Array(TICKET_ATTACHMENT_MAX_FILES + 1).fill(pdf)).ok, false)
})

test("canonical MIME and inline rendering", () => {
  assert.equal(mimeForExtension("pdf"), "application/pdf")
  assert.equal(mimeForExtension("jpeg"), "image/jpeg")
  assert.equal(mimeForExtension("exe"), "application/octet-stream")
  assert.equal(isInlineMimeType("application/pdf"), true)
  assert.equal(isInlineMimeType("image/png"), true)
  assert.equal(isInlineMimeType("text/plain"), false)
})

test("storage keys must be <uuid>/<uuid>.<ext>", () => {
  const u = "3f9c2b1e-1111-4222-8333-444455556666"
  assert.equal(isSafeStorageKey(`${u}/${u}.pdf`), true)
  assert.equal(isSafeStorageKey(`../${u}/${u}.pdf`), false)
  assert.equal(isSafeStorageKey(`${u}/../../etc/passwd`), false)
  assert.equal(isSafeStorageKey(`${u}/${u}.pdf/x`), false)
})

test("filenames are cleaned and safely quoted", () => {
  assert.equal(cleanFilename("C:\\Users\\me\\scan.pdf"), "scan.pdf")
  assert.equal(cleanFilename("../../a\nb.pdf"), "ab.pdf")
  assert.equal(cleanFilename(""), "file")
  assert.equal(fileExtension("Photo.JPEG"), "jpeg")
  assert.equal(contentDisposition('a"b.pdf', true), `inline; filename="a_b.pdf"; filename*=UTF-8''a%22b.pdf`)
  assert.equal(contentDisposition("März.xlsx", false), `attachment; filename="M_rz.xlsx"; filename*=UTF-8''M%C3%A4rz.xlsx`)
})

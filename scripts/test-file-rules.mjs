/**
 * Ad-hoc integration test for the file-upload-rules + help-attachments feature.
 * Mints an admin session cookie (signSession equivalent) and drives the real
 * HTTP endpoints on the dev server.
 *
 *   node scripts/test-file-rules.mjs
 */
import { SignJWT } from "jose"
import { Pool } from "pg"

const ADMIN_ID = "4102ea5d-fd01-4182-b08b-c751d663cd21"
const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`
const SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

let pass = 0
let fail = 0
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function cookie() {
  const token = await new SignJWT({ id: ADMIN_ID, email: "admin@sightseeing.lu", name: "Admin", role: "superadmin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET)
  return `admin_session=${token}`
}

async function uploadFile(ck, { name, type, bytes }) {
  const fd = new FormData()
  fd.append("file", new Blob([bytes], { type }), name)
  const res = await fetch(`${BASE}/api/admin/media`, {
    method: "POST",
    headers: { Cookie: ck },
    body: fd,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

async function main() {
  const ck = await cookie()
  console.log(`Base: ${BASE}`)

  // Ensure clean global default for deterministic tests.
  await fetch(`${BASE}/api/admin/file-rules`, {
    method: "PATCH",
    headers: { Cookie: ck, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "global", rules: { maxSizeMb: 25, allowedExtensions: ["pdf", "jpg", "jpeg", "png", "mp4", "md", "docx"] } }),
  })
  // Clear any superadmin override from prior runs.
  await fetch(`${BASE}/api/admin/file-rules`, {
    method: "PATCH",
    headers: { Cookie: ck, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "user", userId: ADMIN_ID, rules: null }),
  })

  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "utf8")

  console.log("\n[1] Valid PDF under global rules → expect 201")
  {
    const r = await uploadFile(ck, { name: "guide.pdf", type: "application/pdf", bytes: PDF })
    check("valid pdf returns 201", r.status === 201, `(got ${r.status} ${JSON.stringify(r.body)})`)
    check("response carries url", typeof r.body.url === "string")
  }

  console.log("\n[2] Oversized PDF vs rule (3MB > 2MB cap) → expect 400")
  {
    // Tighten the global cap so we can test size enforcement with a small body
    // that still round-trips cleanly through the proxy.
    await fetch(`${BASE}/api/admin/file-rules`, {
      method: "PATCH",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global", rules: { maxSizeMb: 2, allowedExtensions: ["pdf", "jpg", "jpeg", "png", "mp4", "md", "docx"] } }),
    })
    const big = Buffer.alloc(3 * 1024 * 1024, 0x41)
    const r = await uploadFile(ck, { name: "big.pdf", type: "application/pdf", bytes: big })
    check("oversized returns 400", r.status === 400, `(got ${r.status})`)
    check("error mentions size", /too large|Maximum size/i.test(r.body.error || ""), `(${r.body.error})`)
    // Restore the default global cap for the remaining tests.
    await fetch(`${BASE}/api/admin/file-rules`, {
      method: "PATCH",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "global", rules: { maxSizeMb: 25, allowedExtensions: ["pdf", "jpg", "jpeg", "png", "mp4", "md", "docx"] } }),
    })
  }

  console.log("\n[3] Disallowed-by-rule format .zip (safe but not allowed) → expect 400")
  {
    const r = await uploadFile(ck, { name: "data.zip", type: "application/zip", bytes: Buffer.from("PK\x03\x04") })
    check("zip returns 400", r.status === 400, `(got ${r.status})`)
    check("error mentions not permitted", /not permitted|not allowed/i.test(r.body.error || ""), `(${r.body.error})`)
  }

  console.log("\n[4] Unsafe format .svg (never safe) → expect 400")
  {
    const r = await uploadFile(ck, { name: "x.svg", type: "image/svg+xml", bytes: Buffer.from("<svg></svg>") })
    check("svg returns 400", r.status === 400, `(got ${r.status})`)
  }

  console.log("\n[5] Per-user restrictive override (only .md, 1MB) enforced")
  {
    await fetch(`${BASE}/api/admin/file-rules`, {
      method: "PATCH",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "user", userId: ADMIN_ID, rules: { maxSizeMb: 1, allowedExtensions: ["md"] } }),
    })
    const pdfNow = await uploadFile(ck, { name: "still.pdf", type: "application/pdf", bytes: PDF })
    check("pdf now blocked by override", pdfNow.status === 400, `(got ${pdfNow.status})`)
    const md = await uploadFile(ck, { name: "notes.md", type: "text/markdown", bytes: Buffer.from("# hi") })
    check("md allowed by override", md.status === 201, `(got ${md.status} ${JSON.stringify(md.body)})`)
    const bigMd = await uploadFile(ck, { name: "huge.md", type: "text/markdown", bytes: Buffer.alloc(2 * 1024 * 1024, 0x23) })
    check("oversized md blocked (1MB cap)", bigMd.status === 400, `(got ${bigMd.status})`)
    // reset override
    await fetch(`${BASE}/api/admin/file-rules`, {
      method: "PATCH",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "user", userId: ADMIN_ID, rules: null }),
    })
  }

  console.log("\n[6] Help article with attachment → public /help shows it")
  let articleId = null
  {
    const att = { id: "test-att-1", filename: "policy.pdf", title: "Cancellation Policy", url: "/uploads/test-policy.pdf", mimeType: "application/pdf", sizeBytes: 1234 }
    const create = await fetch(`${BASE}/api/admin/help`, {
      method: "POST",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "TEST attachment article (delete me)",
        answer: "This article has a downloadable document.",
        category: "General",
        status: "published",
        audience: "public",
        attachments: [att],
      }),
    })
    const created = await create.json().catch(() => ({}))
    check("create article 201", create.status === 201, `(got ${create.status})`)
    articleId = created.id
    // Read back via admin GET
    const get = await fetch(`${BASE}/api/admin/help/${articleId}`, { headers: { Cookie: ck } })
    const gotten = await get.json().catch(() => ({}))
    const atts = gotten.attachments
    check("attachments persisted", Array.isArray(atts) && atts.length === 1 && atts[0].filename === "policy.pdf", `(${JSON.stringify(atts)})`)
    // Public page HTML (RSC payload) should contain the attachment metadata.
    const html = await (await fetch(`${BASE}/help`)).text()
    check("public /help payload contains attachment", html.includes("Cancellation Policy") || html.includes("/uploads/test-policy.pdf"))
  }

  console.log("\n[7] Malicious attachment URLs stripped (stored-XSS guard)")
  {
    const create = await fetch(`${BASE}/api/admin/help`, {
      method: "POST",
      headers: { Cookie: ck, "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "TEST xss article (delete me)",
        answer: "body",
        category: "General",
        status: "published",
        audience: "public",
        attachments: [
          { id: "x1", filename: "evil.pdf", url: "javascript:alert(1)" },
          { id: "x2", filename: "evil2.pdf", url: "data:text/html,<script>alert(1)</script>" },
          { id: "x3", filename: "proto.pdf", url: "//evil.com/x.pdf" },
          { id: "ok", filename: "good.pdf", url: "/uploads/good.pdf" },
        ],
      }),
    })
    const created = await create.json().catch(() => ({}))
    const atts = created.attachments || []
    check("only the safe attachment survives", atts.length === 1 && atts[0].url === "/uploads/good.pdf", `(${JSON.stringify(atts)})`)
    if (created.id) await pool.query("DELETE FROM help_articles WHERE id = $1", [created.id])
  }

  console.log("\n[8] Help-only employee: upload allowed, media library denied")
  {
    const empId = await (async () => {
      const r = await pool.query(
        `INSERT INTO admin_users (email, name, password_hash, role, permissions)
         VALUES ($1,$2,$3,'employee',$4::jsonb) RETURNING id`,
        ["help-only-test@sightseeing.lu", "Help Only", "x", JSON.stringify(["help"])],
      )
      return r.rows[0].id
    })()
    const empToken = await new SignJWT({ id: empId, email: "help-only-test@sightseeing.lu", name: "Help Only", role: "employee", permissions: ["help"] })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(SECRET)
    const empCk = `admin_session=${empToken}`

    const fd = new FormData()
    fd.append("file", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), "emp.pdf")
    const up = await fetch(`${BASE}/api/admin/help/upload`, { method: "POST", headers: { Cookie: empCk }, body: fd })
    const upBody = await up.json().catch(() => ({}))
    check("help-only employee CAN upload attachment", up.status === 201, `(got ${up.status} ${JSON.stringify(upBody)})`)

    const lib = await fetch(`${BASE}/api/admin/media`, { headers: { Cookie: empCk } })
    check("help-only employee CANNOT list media library", lib.status === 403, `(got ${lib.status})`)

    // cleanup the uploaded file + db record + temp user
    if (up.status === 201 && upBody.url?.startsWith("/uploads/")) {
      try { (await import("fs")).unlinkSync("public" + upBody.url) } catch {}
      await pool.query("DELETE FROM media_files WHERE url = $1", [upBody.url])
    }
    await pool.query("DELETE FROM admin_users WHERE id = $1", [empId])
  }

  // Cleanup the test article.
  if (articleId) {
    await pool.query("DELETE FROM help_articles WHERE id = $1", [articleId])
    console.log("\n(cleaned up test article)")
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  await pool.end()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })

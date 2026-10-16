import test from "node:test"
import assert from "node:assert/strict"

const mod = await import("../.test-build/ticket-email.js")
const { parseEmailList, ticketRecipients, buildTicketEmails } = mod.default ?? mod

const ticket = { id: "59fdf4b5-f8e8-4df3-9ac5-9fcf48671512", subject: "Booking widget <broken>", description: "Steps:\n1. open\n2. <script>x</script>", category: "bug", priority: "high", status: "open", authorName: "Ana", authorEmail: "ana@sightseeing.lu" }
const team = ["hello@sightseeing.lu", "dev@agency.com"]
const ana = { name: "Ana", email: "ana@sightseeing.lu" }
const bob = { name: "Bob", email: "bob@sightseeing.lu" }

test("parseEmailList splits, validates, dedupes, caps at 10", () => {
  const r = parseEmailList("a@x.lu, b@y.lu\nA@X.lu; nope")
  assert.deepEqual(r.emails, ["a@x.lu", "b@y.lu"])
  assert.deepEqual(r.invalid, ["nope"])
  assert.equal(parseEmailList(Array.from({ length: 15 }, (_, i) => `u${i}@x.lu`)).emails.length, 10)
  assert.deepEqual(parseEmailList("").emails, [])
})

test("created → team, plus the author when someone else opened it; never the actor", () => {
  assert.deepEqual(ticketRecipients({ kind: "created" }, ticket, team, ana), team)
  assert.deepEqual(ticketRecipients({ kind: "created" }, ticket, ["ana@sightseeing.lu", "dev@agency.com"], ana), ["dev@agency.com"])
  assert.deepEqual(ticketRecipients({ kind: "created" }, ticket, team, bob), ["ana@sightseeing.lu", ...team])
})

test("status → author only, skipped when the author changed it", () => {
  const ev = { kind: "status", from: "open", to: "resolved" }
  assert.deepEqual(ticketRecipients(ev, ticket, team, bob), ["ana@sightseeing.lu"])
  assert.deepEqual(ticketRecipients(ev, ticket, team, ana), [])
})

test("reply → author + team minus the replier, deduped", () => {
  const ev = { kind: "reply", message: "hi" }
  assert.deepEqual(ticketRecipients(ev, ticket, team, bob), ["ana@sightseeing.lu", ...team])
  assert.deepEqual(ticketRecipients(ev, ticket, team, ana), team)
  assert.deepEqual(ticketRecipients(ev, ticket, ["ANA@sightseeing.lu"], bob), ["ana@sightseeing.lu"])
})

const staffTicket = { ...ticket, authorRole: "admin" }
const clientTicket = { ...ticket, authorName: "Jo", authorEmail: "jo@client.com", authorRole: "user" }

test("buildTicketEmails: empty when nobody to notify", () => {
  assert.deepEqual(buildTicketEmails({ kind: "status", from: "open", to: "closed" }, ticket, ana, team, "https://sightseeing.lu"), [])
})

test("buildTicketEmails: reply → author + team emails, link for staff, escaped HTML", () => {
  const [toAuthor, toTeam] = buildTicketEmails({ kind: "reply", message: "Fixed <b>now</b>" }, staffTicket, bob, team, "https://sightseeing.lu/")
  assert.deepEqual(toAuthor.to, ["ana@sightseeing.lu"])
  assert.deepEqual(toTeam.to, team)
  assert.match(toTeam.subject, /^\[Ticket 59fdf4b5\] New reply — Booking widget <broken>$/)
  assert.match(toTeam.text, /Open the ticket: https:\/\/sightseeing\.lu\/admin\/tickets\/59fdf4b5-/)
  assert.match(toAuthor.text, /Open the ticket: https:/)            // staff author gets the admin link
  assert.equal(toTeam.replyTo, "bob@sightseeing.lu")
  assert.ok(toTeam.html.includes("Fixed &lt;b&gt;now&lt;/b&gt;"))
  assert.ok(toTeam.html.includes("Booking widget &lt;broken&gt;"))
  assert.ok(!toTeam.html.includes("<b>now"))
})

test("buildTicketEmails: status wording", () => {
  const [m] = buildTicketEmails({ kind: "status", from: "in-progress", to: "resolved" }, ticket, bob, team, "https://sightseeing.lu")
  assert.deepEqual(m.to, ["ana@sightseeing.lu"])
  assert.match(m.text, /from "in progress" to "resolved"/)
})

test("created for a client → confirmation to the client (no admin link) + 'New' to team", () => {
  const mails = buildTicketEmails({ kind: "created" }, clientTicket, ana, team, "https://sightseeing.lu")
  assert.equal(mails.length, 2)
  const [toClient, toTeam] = mails
  assert.deepEqual(toClient.to, ["jo@client.com"])
  assert.match(toClient.subject, /^\[Ticket 59fdf4b5\] We received your request: /)
  assert.match(toClient.text, /opened a support ticket for you/)
  assert.match(toClient.text, /reply to this email/i)
  assert.ok(!toClient.text.includes("/admin/") && !toClient.html.includes("/admin/"))
  assert.deepEqual(toTeam.to, team)
  assert.match(toTeam.subject, /\] New: /)
  assert.ok(toTeam.text.includes("/admin/tickets/"))
})

test("created by the author themselves → no confirmation, team only", () => {
  const mails = buildTicketEmails({ kind: "created" }, staffTicket, ana, team, "https://sightseeing.lu")
  assert.equal(mails.length, 1)
  assert.deepEqual(mails[0].to, team)
})

test("client emails (status/reply) never contain the admin link", () => {
  for (const ev of [{ kind: "status", from: "open", to: "resolved" }, { kind: "reply", message: "Done" }]) {
    const toClient = buildTicketEmails(ev, clientTicket, ana, team, "https://sightseeing.lu")[0]
    assert.deepEqual(toClient.to, ["jo@client.com"])
    assert.ok(!toClient.text.includes("/admin/"))
  }
})

const fields = await import("../.test-build/ticket-fields.js")
const { resolveTicketAuthor } = fields.default ?? fields
const { isValidEmail } = (await import("../.test-build/job-email.js"))
const admin = { name: "Ana", email: "ana@sightseeing.lu", role: "superadmin" }

test("resolveTicketAuthor: defaults to the logged-in admin", () => {
  assert.deepEqual(resolveTicketAuthor({}, admin, isValidEmail), { ok: true, name: "Ana", email: "ana@sightseeing.lu", role: "superadmin" })
  assert.deepEqual(resolveTicketAuthor({ authorEmail: "  " }, admin, isValidEmail), { ok: true, name: "Ana", email: "ana@sightseeing.lu", role: "superadmin" })
})

test("resolveTicketAuthor: a client email becomes an external 'user' author", () => {
  assert.deepEqual(resolveTicketAuthor({ authorName: " Jo Client ", authorEmail: " jo@client.com " }, admin, isValidEmail), { ok: true, name: "Jo Client", email: "jo@client.com", role: "user" })
  assert.deepEqual(resolveTicketAuthor({ authorEmail: "jo@client.com" }, admin, isValidEmail), { ok: true, name: "jo@client.com", email: "jo@client.com", role: "user" })
  assert.equal(resolveTicketAuthor({ authorEmail: "ANA@sightseeing.lu" }, admin, isValidEmail).role, "superadmin")
})

test("resolveTicketAuthor: rejects an invalid email", () => {
  const r = resolveTicketAuthor({ authorEmail: "jo@client" }, admin, isValidEmail)
  assert.equal(r.ok, false)
  assert.match(r.error, /not a valid author email/)
})

test("status change on a client ticket notifies the client, not the staff member", () => {
  const [m] = buildTicketEmails({ kind: "status", from: "open", to: "in-progress" }, clientTicket, ana, team, "https://sightseeing.lu")
  assert.deepEqual(m.to, ["jo@client.com"])
})

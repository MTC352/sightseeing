"use client"

import { useEffect, useState, useCallback } from "react"
import { ShieldCheck, Loader2, Check, AlertCircle, RotateCcw, Save, ShieldAlert, UserCog } from "lucide-react"

type Rules = { maxSizeMb: number; allowedExtensions: string[] }

type UserRow = {
  id: string
  name: string
  username: string | null
  email: string | null
  role: string
  fileRules: Rules | null
  effective: Rules
}

type Payload = {
  global: Rules
  defaults: Rules
  hardMaxMb: number
  safeExtensions: string[]
  users: UserRow[]
}

export default function FileRulesPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/file-rules")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load file rules")
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load file rules")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">File Upload Rules</h1>
          <p className="text-sm text-muted-foreground">
            Control the maximum file size and allowed formats for uploads — globally, or per user.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {loading || !data ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <GlobalEditor data={data} onSaved={load} />

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Per-user overrides
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Leave a user on the global default, or set a stricter (or different) rule just for them. Overrides are still
              clamped to a {data.hardMaxMb} MB hard ceiling and the platform&apos;s safe format list.
            </p>
            <div className="space-y-2">
              {data.users.map((u) => (
                <UserEditor key={u.id} user={u} safeExtensions={data.safeExtensions} hardMaxMb={data.hardMaxMb} global={data.global} onSaved={load} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function ExtensionPicker({
  selected, options, onToggle,
}: {
  selected: string[]
  options: string[]
  onToggle: (ext: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((ext) => {
        const on = selected.includes(ext)
        return (
          <button
            key={ext}
            type="button"
            onClick={() => onToggle(ext)}
            className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
              on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            .{ext}
          </button>
        )
      })}
    </div>
  )
}

function GlobalEditor({ data, onSaved }: { data: Payload; onSaved: () => void }) {
  const [maxSizeMb, setMaxSizeMb] = useState(data.global.maxSizeMb)
  const [exts, setExts] = useState<string[]>(data.global.allowedExtensions)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState("")

  function toggle(ext: string) {
    setExts((list) => (list.includes(ext) ? list.filter((e) => e !== ext) : [...list, ext]))
  }

  async function save() {
    setSaving(true); setErr(""); setSaved(false)
    try {
      const res = await fetch("/api/admin/file-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "global", rules: { maxSizeMb, allowedExtensions: exts } }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed")
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Global default</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Applies to every user who doesn&apos;t have a personal override.
      </p>

      {err && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}

      <div className="mb-4 max-w-xs">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Maximum file size (MB) — hard ceiling {data.hardMaxMb} MB
        </label>
        <input
          type="number"
          min={1}
          max={data.hardMaxMb}
          value={maxSizeMb}
          onChange={(e) => setMaxSizeMb(Number(e.target.value))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="mb-4">
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Allowed formats</label>
        <ExtensionPicker selected={exts} options={data.safeExtensions} onToggle={toggle} />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving || exts.length === 0}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {saved ? <Check className="h-4 w-4" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Saved" : saving ? "Saving..." : "Save global default"}
      </button>
      {exts.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600"><AlertCircle className="h-3.5 w-3.5" /> Pick at least one format.</p>
      )}
    </section>
  )
}

function UserEditor({
  user, safeExtensions, hardMaxMb, global, onSaved,
}: {
  user: UserRow
  safeExtensions: string[]
  hardMaxMb: number
  global: Rules
  onSaved: () => void
}) {
  const hasOverride = user.fileRules != null
  const [editing, setEditing] = useState(false)
  const [override, setOverride] = useState(hasOverride)
  const [maxSizeMb, setMaxSizeMb] = useState((user.fileRules ?? user.effective).maxSizeMb)
  const [exts, setExts] = useState<string[]>((user.fileRules ?? user.effective).allowedExtensions)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  function toggle(ext: string) {
    setExts((list) => (list.includes(ext) ? list.filter((e) => e !== ext) : [...list, ext]))
  }

  async function save() {
    setSaving(true); setErr("")
    try {
      const rules = override ? { maxSizeMb, allowedExtensions: exts } : null
      const res = await fetch("/api/admin/file-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "user", userId: user.id, rules }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed")
      setEditing(false)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <UserCog className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {user.name}{" "}
            <span className="font-normal text-muted-foreground">
              {user.username ? `@${user.username}` : user.email} · {user.role === "superadmin" ? "Admin" : "Employee"}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {hasOverride ? (
              <span className="font-medium text-primary">Custom: {user.effective.maxSizeMb} MB · {user.effective.allowedExtensions.map((e) => `.${e}`).join(", ")}</span>
            ) : (
              <>Inherits global ({user.effective.maxSizeMb} MB · {user.effective.allowedExtensions.map((e) => `.${e}`).join(", ")})</>
            )}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Edit rules
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p>}

          <label className="flex items-center gap-2.5 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm font-medium text-foreground">Use a custom rule for this user</span>
            <span className="text-xs text-muted-foreground">{override ? "Custom" : "Inherits global default"}</span>
          </label>

          {override && (
            <>
              <div className="max-w-xs">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Maximum file size (MB) — ceiling {hardMaxMb} MB</label>
                <input
                  type="number"
                  min={1}
                  max={hardMaxMb}
                  value={maxSizeMb}
                  onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Allowed formats</label>
                <ExtensionPicker selected={exts} options={safeExtensions} onToggle={toggle} />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || (override && exts.length === 0)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setOverride(hasOverride)
                setMaxSizeMb((user.fileRules ?? user.effective).maxSizeMb)
                setExts((user.fileRules ?? user.effective).allowedExtensions)
                setErr("")
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            {override && (
              <button
                type="button"
                onClick={() => { setOverride(false); setExts(global.allowedExtensions); setMaxSizeMb(global.maxSizeMb) }}
                className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to global
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

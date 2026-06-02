"use client"

import { useEffect, useState, useCallback } from "react"
import { ADMIN_SECTIONS, type PermissionKey } from "@/lib/admin-permissions"
import {
  Users, Plus, Trash2, Loader2, ShieldCheck, X, KeyRound, Check, Pencil, UserCog,
} from "lucide-react"

type AdminUser = {
  id: string
  email: string | null
  username: string | null
  name: string
  role: string
  permissions: string[]
  is_active: boolean
  last_login: string | null
  created_at: string
}

const EMPTY_FORM = {
  username: "",
  name: "",
  email: "",
  password: "",
  permissions: [] as PermissionKey[],
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/users")
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load users")
      setUsers(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const employees = users.filter((u) => u.role !== "superadmin")
  const admins = users.filter((u) => u.role === "superadmin")

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground">Create employee accounts and control which admin sections they can access.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New employee
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {admins.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Administrators</h2>
              <div className="space-y-2">
                {admins.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ?? u.username} · Full access</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">Superadmin</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Employees ({employees.length})
            </h2>
            {employees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                <UserCog className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">No employee accounts yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Create one and grant access to specific admin sections.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {employees.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setEditing(u)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/30 hover:bg-secondary/40"
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${u.is_active ? "bg-primary/10" : "bg-muted"}`}>
                      <UserCog className={`h-4 w-4 ${u.is_active ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {u.name} <span className="font-normal text-muted-foreground">@{u.username}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.permissions.length === 0
                          ? "No sections granted"
                          : `${u.permissions.length} section${u.permissions.length === 1 ? "" : "s"}: ${u.permissions.join(", ")}`}
                      </p>
                    </div>
                    {!u.is_active && (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Disabled</span>
                    )}
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {showCreate && (
        <EmployeeDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {editing && (
        <EmployeeDialog
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function EmployeeDialog({
  mode, user, onClose, onSaved,
}: {
  mode: "create" | "edit"
  user?: AdminUser
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() =>
    mode === "edit" && user
      ? {
          username: user.username ?? "",
          name: user.name,
          email: user.email ?? "",
          password: "",
          permissions: user.permissions.filter((p): p is PermissionKey =>
            ADMIN_SECTIONS.some((s) => s.key === p)),
        }
      : { ...EMPTY_FORM },
  )
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  function togglePerm(key: PermissionKey) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError("")
    try {
      const url = mode === "create" ? "/api/admin/users" : `/api/admin/users/${user!.id}`
      const method = mode === "create" ? "POST" : "PATCH"
      const payload: Record<string, unknown> = {
        username: form.username,
        name: form.name,
        email: form.email,
        permissions: form.permissions,
      }
      if (mode === "edit") payload.is_active = isActive
      if (form.password.trim()) payload.password = form.password
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!user) return
    if (!confirm(`Delete employee "${user.name}"? This cannot be undone.`)) return
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-bold text-foreground">
            {mode === "create" ? "New employee account" : `Edit ${user?.name}`}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username *</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="e.g. jdupont"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Jean Dupont"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email (optional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="optional"
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" />
              {mode === "create" ? "Password * (min 8 chars)" : "New password (leave blank to keep current)"}
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={mode === "create" ? "Set a password" : "••••••••"}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Admin sections this employee can access</label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ADMIN_SECTIONS.map((s) => {
                const checked = form.permissions.includes(s.key)
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => togglePerm(s.key)}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                      checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/40"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground">{s.label}</span>
                      <span className="block text-[10px] leading-tight text-muted-foreground">{s.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {mode === "edit" && (
            <label className="flex items-center gap-2.5 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium text-foreground">Account active</span>
              <span className="text-xs text-muted-foreground">{isActive ? "Can sign in" : "Sign-in disabled"}</span>
            </label>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          {mode === "edit" ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create employee" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

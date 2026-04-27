"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Ticket, Eye, Trash2, AlertCircle, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react"
import {
  useGetTicketsQuery,
  useDeleteTicketMutation,
  useCreateTicketMutation,
} from "@/store/admin/api"
import type { Ticket as TicketType } from "@/store/admin/api"

const PRIORITY_STYLES = {
  low: "bg-slate-500/15 text-slate-600",
  medium: "bg-blue-500/15 text-blue-600",
  high: "bg-amber-500/15 text-amber-600",
  urgent: "bg-red-500/15 text-red-600",
}

const STATUS_STYLES = {
  open: "bg-emerald-500/15 text-emerald-600",
  "in-progress": "bg-blue-500/15 text-blue-600",
  waiting: "bg-amber-500/15 text-amber-600",
  resolved: "bg-slate-500/15 text-slate-600",
  closed: "bg-slate-400/15 text-slate-500",
}

const STATUS_ICONS = {
  open: AlertCircle,
  "in-progress": Loader2,
  waiting: Clock,
  resolved: CheckCircle,
  closed: XCircle,
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  question: "Question",
  billing: "Billing",
  other: "Other",
}

export default function AdminTicketsPage() {
  const { data: tickets = [], isLoading } = useGetTicketsQuery()
  const [deleteTicket] = useDeleteTicketMutation()
  const [showNewForm, setShowNewForm] = useState(false)
  const [filter, setFilter] = useState<"all" | "open" | "in-progress" | "resolved">("all")

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this ticket?")) return
    await deleteTicket(id)
  }

  const filteredTickets = filter === "all"
    ? tickets
    : tickets.filter((t) => t.status === filter || (filter === "open" && t.status === "open"))

  const openCount = tickets.filter((t) => t.status === "open").length
  const inProgressCount = tickets.filter((t) => t.status === "in-progress").length

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Support</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Tickets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {openCount} open, {inProgressCount} in progress
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-2">
        {(["all", "open", "in-progress", "resolved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1).replace("-", " ")}
          </button>
        ))}
      </div>

      {/* New Ticket Form Modal */}
      {showNewForm && (
        <NewTicketForm onClose={() => setShowNewForm(false)} />
      )}

      {/* Tickets List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Ticket className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No tickets found</p>
          <button
            onClick={() => setShowNewForm(true)}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Create your first ticket
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Subject</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 sm:table-cell">Category</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 md:table-cell">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60 lg:table-cell">Author</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTickets.map((ticket) => {
                const StatusIcon = STATUS_ICONS[ticket.status] ?? AlertCircle
                return (
                  <tr key={ticket.id} className="group transition-colors hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <p className="truncate font-medium text-foreground">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleDateString()} &middot; {ticket.replies?.length ?? 0} replies
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[ticket.priority]}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[ticket.status]}`}>
                        <StatusIcon className="h-3 w-3" />
                        {ticket.status.replace("-", " ")}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <p className="text-foreground">{ticket.authorName}</p>
                      <p className="text-xs text-muted-foreground">{ticket.authorRole}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/tickets/${ticket.id}`}
                          className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
                          title="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(ticket.id)}
                          className="rounded-lg p-2 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewTicketForm({ onClose }: { onClose: () => void }) {
  const [createTicket, { isLoading }] = useCreateTicketMutation()
  const [form, setForm] = useState({
    subject: "",
    description: "",
    category: "question" as TicketType["category"],
    priority: "medium" as TicketType["priority"],
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createTicket(form).unwrap()
      onClose()
    } catch {
      alert("Failed to create ticket")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-foreground">New Support Ticket</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Brief description of the issue"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="h-32 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Detailed description of the issue or request"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as TicketType["category"] })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="bug">Bug Report</option>
                <option value="feature">Feature Request</option>
                <option value="question">Question</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TicketType["priority"] })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

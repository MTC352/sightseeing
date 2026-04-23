"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Send, Loader2, AlertCircle, Clock, CheckCircle, XCircle, User } from "lucide-react"
import type { SupportTicket, TicketReply } from "@/lib/admin-store"

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

const ROLE_STYLES = {
  user: "bg-slate-500/15 text-slate-600",
  admin: "bg-blue-500/15 text-blue-600",
  superadmin: "bg-purple-500/15 text-purple-600",
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchTicket()
  }, [id])

  async function fetchTicket() {
    try {
      const res = await fetch(`/api/admin/tickets/${id}`)
      if (!res.ok) throw new Error("Ticket not found")
      const data = await res.json()
      setTicket(data)
    } catch (error) {
      console.error("Failed to fetch ticket:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(newStatus: SupportTicket["status"]) {
    if (!ticket) return
    setUpdating(true)
    
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      
      if (!res.ok) throw new Error("Failed to update status")
      
      const updated = await res.json()
      setTicket(updated)
    } catch (error) {
      console.error("Failed to update status:", error)
    } finally {
      setUpdating(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !ticket) return
    
    setSubmitting(true)
    
    try {
      const res = await fetch(`/api/admin/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText,
          authorRole: "superadmin", // For now, assume super admin
          authorName: "Super Admin",
        }),
      })

      if (!res.ok) throw new Error("Failed to add reply")

      const reply = await res.json()
      setTicket((prev) => prev ? {
        ...prev,
        replies: [...prev.replies, reply],
      } : null)
      setReplyText("")
    } catch (error) {
      console.error("Failed to add reply:", error)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="p-6 lg:p-10">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Ticket not found</p>
          <Link href="/admin/tickets" className="mt-3 text-sm font-medium text-primary hover:underline">
            Back to tickets
          </Link>
        </div>
      </div>
    )
  }

  const StatusIcon = STATUS_ICONS[ticket.status]

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/tickets"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            Ticket #{ticket.id.replace("ticket_", "")} &middot; Created {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Original Ticket */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{ticket.authorName}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket.authorEmail} &middot; <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_STYLES[ticket.authorRole]}`}>{ticket.authorRole}</span>
                </p>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{ticket.description}</p>
          </div>

          {/* Replies */}
          {ticket.replies.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Replies ({ticket.replies.length})</h2>
              {ticket.replies.map((reply) => (
                <ReplyCard key={reply.id} reply={reply} />
              ))}
            </div>
          )}

          {/* Reply Form */}
          {ticket.status !== "closed" && (
            <form onSubmit={handleReply} className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Add Reply</h2>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                className="h-32 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !replyText.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Reply
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Ticket Details</h2>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[ticket.status]}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {ticket.status.replace("-", " ")}
                </span>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Priority</p>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${PRIORITY_STYLES[ticket.priority]}`}>
                  {ticket.priority}
                </span>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Category</p>
                <p className="text-sm text-foreground capitalize">{ticket.category.replace("-", " ")}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Last Updated</p>
                <p className="text-sm text-foreground">{new Date(ticket.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Actions Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Actions</h2>
            <div className="space-y-2">
              {ticket.status === "open" && (
                <button
                  onClick={() => handleStatusChange("in-progress")}
                  disabled={updating}
                  className="w-full rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                >
                  Start Working
                </button>
              )}
              {ticket.status === "in-progress" && (
                <>
                  <button
                    onClick={() => handleStatusChange("waiting")}
                    disabled={updating}
                    className="w-full rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    Waiting for Response
                  </button>
                  <button
                    onClick={() => handleStatusChange("resolved")}
                    disabled={updating}
                    className="w-full rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                </>
              )}
              {ticket.status === "waiting" && (
                <button
                  onClick={() => handleStatusChange("in-progress")}
                  disabled={updating}
                  className="w-full rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                >
                  Resume Working
                </button>
              )}
              {ticket.status === "resolved" && (
                <button
                  onClick={() => handleStatusChange("closed")}
                  disabled={updating}
                  className="w-full rounded-lg bg-slate-500/10 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-500/20 disabled:opacity-50"
                >
                  Close Ticket
                </button>
              )}
              {ticket.status !== "closed" && ticket.status !== "open" && (
                <button
                  onClick={() => handleStatusChange("open")}
                  disabled={updating}
                  className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReplyCard({ reply }: { reply: TicketReply }) {
  const isStaff = reply.authorRole !== "user"
  
  return (
    <div className={`rounded-xl border p-5 ${isStaff ? "border-primary/20 bg-primary/5" : "border-border bg-card"}`}>
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isStaff ? "bg-primary/20" : "bg-secondary"}`}>
          <User className={`h-4 w-4 ${isStaff ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{reply.authorName}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(reply.createdAt).toLocaleString()} &middot;{" "}
            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_STYLES[reply.authorRole]}`}>
              {reply.authorRole}
            </span>
          </p>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{reply.message}</p>
    </div>
  )
}

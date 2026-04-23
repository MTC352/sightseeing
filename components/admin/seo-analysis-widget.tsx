"use client"

import { useState } from "react"
import type { AdminTrip } from "@/lib/admin-store"
import {
  Search,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Bot,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface SEOAnalysis {
  overallScore: number
  keywordOpportunities: {
    keyword: string
    searchVolume: "high" | "medium" | "low"
    difficulty: "easy" | "medium" | "hard"
    currentRelevance: number
    potentialRank: string
  }[]
  improvements: {
    field: string
    issue: string
    suggestion: string
    impact: "high" | "medium" | "low"
    optimizedText: string
  }[]
  strengths: string[]
  missingKeywords: string[]
  aiSearchOptimization: {
    score: number
    suggestions: string[]
  }
}

interface Props {
  tripData: Partial<AdminTrip>
  onApplyOptimization: (field: keyof AdminTrip, value: string) => void
}

export function SEOAnalysisWidget({ tripData, onApplyOptimization }: Props) {
  const [analysis, setAnalysis] = useState<SEOAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>("keywords")
  const [appliedFields, setAppliedFields] = useState<Set<string>>(new Set())

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setAppliedFields(new Set())

    try {
      const res = await fetch("/api/admin/seo-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripData }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed")
      }

      if (data.overallScore !== undefined) {
        setAnalysis(data)
      } else {
        throw new Error("Invalid analysis response")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed")
    } finally {
      setLoading(false)
    }
  }

  function applyOptimization(field: string, text: string) {
    const fieldMap: Record<string, keyof AdminTrip> = {
      title: "title",
      description: "description",
      highlights: "highlights",
      tags: "tags",
    }
    const tripField = fieldMap[field.toLowerCase()]
    if (tripField) {
      if (tripField === "highlights") {
        // Parse as array if it's highlights
        const highlights = text.split(/[;,]/).map((h) => h.trim()).filter(Boolean)
        onApplyOptimization(tripField, highlights as unknown as string)
      } else if (tripField === "tags") {
        const tags = text.split(/[;,]/).map((t) => t.trim().toLowerCase()).filter(Boolean)
        onApplyOptimization(tripField, tags as unknown as string)
      } else {
        onApplyOptimization(tripField, text)
      }
      setAppliedFields((prev) => new Set([...prev, field]))
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500"
    if (score >= 60) return "text-amber-500"
    return "text-red-500"
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500"
    if (score >= 60) return "bg-amber-500"
    return "bg-red-500"
  }

  const getImpactColor = (impact: string) => {
    if (impact === "high") return "bg-red-500/15 text-red-500"
    if (impact === "medium") return "bg-amber-500/15 text-amber-500"
    return "bg-blue-500/15 text-blue-500"
  }

  const getVolumeIcon = (volume: string) => {
    if (volume === "high") return <TrendingUp className="h-3 w-3 text-emerald-500" />
    if (volume === "medium") return <TrendingUp className="h-3 w-3 text-amber-500" />
    return <TrendingUp className="h-3 w-3 text-muted-foreground" />
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
            <Search className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI SEO Analysis</h3>
            <p className="text-[10px] text-muted-foreground">Optimize for Luxembourg tourism searches</p>
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze SEO"}
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {!analysis && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Ready to optimize your listing</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click &quot;Analyze SEO&quot; to get AI-powered recommendations
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Analyzing your content…</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-4">
            {/* Overall Score */}
            <div className="flex items-center gap-4 rounded-xl bg-secondary/30 p-4">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90 transform">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-border"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeDasharray={`${(analysis.overallScore / 100) * 176} 176`}
                    strokeLinecap="round"
                    className={getScoreColor(analysis.overallScore)}
                  />
                </svg>
                <span className={cn("absolute inset-0 flex items-center justify-center text-lg font-bold", getScoreColor(analysis.overallScore))}>
                  {analysis.overallScore}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">SEO Score</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {analysis.overallScore >= 80
                    ? "Excellent! Your listing is well-optimized."
                    : analysis.overallScore >= 60
                      ? "Good, but there's room for improvement."
                      : "Needs optimization to rank higher."}
                </p>
                {analysis.aiSearchOptimization && (
                  <div className="mt-2 flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      AI Search Score: <span className={getScoreColor(analysis.aiSearchOptimization.score)}>{analysis.aiSearchOptimization.score}/100</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Keyword Opportunities */}
            <div className="rounded-xl border border-border">
              <button
                onClick={() => toggleSection("keywords")}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Keyword Opportunities</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {analysis.keywordOpportunities.length}
                  </span>
                </div>
                {expandedSection === "keywords" ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {expandedSection === "keywords" && (
                <div className="border-t border-border px-4 py-3">
                  <div className="space-y-2">
                    {analysis.keywordOpportunities.map((kw, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {getVolumeIcon(kw.searchVolume)}
                          <span className="text-xs font-medium text-foreground">{kw.keyword}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-medium",
                            kw.potentialRank === "1-3" ? "bg-emerald-500/15 text-emerald-500" :
                            kw.potentialRank === "4-10" ? "bg-amber-500/15 text-amber-500" :
                            "bg-muted text-muted-foreground"
                          )}>
                            Rank {kw.potentialRank}
                          </span>
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-border">
                            <div
                              className={cn("h-full rounded-full", getScoreBg(kw.currentRelevance))}
                              style={{ width: `${kw.currentRelevance}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {analysis.missingKeywords.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Missing Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.missingKeywords.map((kw, idx) => (
                          <span key={idx} className="rounded-full border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                            + {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Improvements */}
            <div className="rounded-xl border border-border">
              <button
                onClick={() => toggleSection("improvements")}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-foreground">Improvements</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                    {analysis.improvements.length}
                  </span>
                </div>
                {expandedSection === "improvements" ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {expandedSection === "improvements" && (
                <div className="space-y-3 border-t border-border px-4 py-3">
                  {analysis.improvements.map((imp, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-secondary/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase text-foreground">
                            {imp.field}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium uppercase", getImpactColor(imp.impact))}>
                            {imp.impact} impact
                          </span>
                        </div>
                        {appliedFields.has(imp.field) ? (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                            <Check className="h-3 w-3" /> Applied
                          </span>
                        ) : (
                          <button
                            onClick={() => applyOptimization(imp.field, imp.optimizedText)}
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                          >
                            <Sparkles className="h-3 w-3" />
                            Apply Fix
                          </button>
                        )}
                      </div>
                      <div className="mb-2">
                        <p className="text-xs text-foreground">{imp.issue}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{imp.suggestion}</p>
                      </div>
                      <div className="rounded-lg bg-card p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Optimized Text</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(imp.optimizedText)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="text-xs leading-relaxed text-foreground">{imp.optimizedText}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div className="rounded-xl border border-border">
                <button
                  onClick={() => toggleSection("strengths")}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-foreground">Strengths</span>
                  </div>
                  {expandedSection === "strengths" ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {expandedSection === "strengths" && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="space-y-1.5">
                      {analysis.strengths.map((s, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                          <span className="text-xs text-foreground">{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Search Tips */}
            {analysis.aiSearchOptimization?.suggestions?.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">AI Search Optimization Tips</span>
                </div>
                <div className="space-y-1.5">
                  {analysis.aiSearchOptimization.suggestions.map((s, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <ArrowRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                      <span className="text-[11px] text-muted-foreground">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

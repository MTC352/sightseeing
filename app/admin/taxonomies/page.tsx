"use client"

import { useState } from "react"
import { Save, Plus, X, Tag } from "lucide-react"

interface TaxItem {
  key: string
  label: string
  value: string
}

const DEFAULT_TAXONOMIES: TaxItem[] = [
  { key: "hero_title", label: "Hero Title", value: "Handpicked Experiences" },
  { key: "hero_subtitle", label: "Hero Subtitle", value: "Join us on the hunt for the best activities in and around Luxembourg." },
  { key: "cat_food_events", label: "Category: Food & Events", value: "Dinners, concerts, wine tastings, and more." },
  { key: "cat_sports_nature", label: "Category: Sports & Nature", value: "Outdoor adventures, cycling tours, and guided hikes." },
  { key: "cat_culture", label: "Category: Culture", value: "Museums, historical sites, and cultural experiences." },
  { key: "cat_tours", label: "Category: Tours", value: "Guided city tours and day trips across Luxembourg." },
  { key: "cat_private_tours", label: "Category: Private Tours", value: "Bespoke private experiences tailored to you." },
  { key: "faq_cancellation", label: "FAQ: Cancellation Policy", value: "Free cancellation up to 24 hours before the activity starts." },
  { key: "faq_payment", label: "FAQ: Payment Methods", value: "We accept Visa, Mastercard, and American Express." },
  { key: "faq_group_size", label: "FAQ: Group Size", value: "Groups are typically 8–15 people, though private tours can be smaller." },
  { key: "faq_languages", label: "FAQ: Languages", value: "Most tours are available in English, French, and German." },
  { key: "about_tagline", label: "About: Tagline", value: "Luxembourg's leading tour operator since 2018." },
]

export default function TaxonomiesPage() {
  const [items, setItems] = useState<TaxItem[]>(DEFAULT_TAXONOMIES)
  const [saved, setSaved] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [newLabel, setNewLabel] = useState("")

  function update(key: string, value: string) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, value } : i)))
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key))
  }

  function addItem() {
    if (!newKey.trim() || !newLabel.trim()) return
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_")
    if (items.find((i) => i.key === key)) return
    setItems((prev) => [...prev, { key, label: newLabel.trim(), value: "" }])
    setNewKey("")
    setNewLabel("")
  }

  async function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
  const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

  const groups: Record<string, TaxItem[]> = {}
  for (const item of items) {
    const prefix = item.key.split("_")[0]
    groups[prefix] = groups[prefix] ?? []
    groups[prefix].push(item)
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/60">Content</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Taxonomies</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage site-wide text labels, descriptions, and FAQ answers.</p>
        </div>
        <button type="button" onClick={handleSave}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : "Save All"}
        </button>
      </div>

      <div className="flex flex-col gap-8">
        {Object.entries(groups).map(([group, groupItems]) => (
          <div key={group}>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
              <Tag className="h-3.5 w-3.5" />
              {group}
            </h2>
            <div className="flex flex-col gap-3">
              {groupItems.map((item) => (
                <div key={item.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className={labelClass}>{item.label}</label>
                    <button type="button" onClick={() => remove(item.key)}
                      className="text-muted-foreground/40 transition-colors hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {item.value.length > 80 ? (
                    <textarea rows={2} className={inputClass} value={item.value} onChange={(e) => update(item.key, e.target.value)} />
                  ) : (
                    <input type="text" className={inputClass} value={item.value} onChange={(e) => update(item.key, e.target.value)} />
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground/50">key: {item.key}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Add Custom Entry</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Key (prefix_name)</label>
            <input type="text" className={inputClass} placeholder="hero_cta_text" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Display Label</label>
            <input type="text" className={inputClass} placeholder="Hero CTA Button Text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </div>
        </div>
        <button type="button" onClick={addItem}
          className="mt-3 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-secondary hover:text-foreground">
          <Plus className="h-4 w-4" /> Add Entry
        </button>
      </div>
    </div>
  )
}

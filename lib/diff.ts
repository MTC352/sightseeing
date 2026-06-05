export type DiffLine = {
  type: "same" | "add" | "remove"
  text: string
}

/**
 * Minimal line-level diff (LCS-based) between two multi-line strings.
 * Returns an ordered list of lines tagged as unchanged, added (present only in
 * `next`), or removed (present only in `prev`). Used by the admin AI-config
 * comparison view to highlight what an overwrite would change.
 */
export function diffLines(prev: string, next: string): DiffLine[] {
  const a = prev.split("\n")
  const b = next.split("\n")
  const n = a.length
  const m = b.length

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "remove", text: a[i] })
      i++
    } else {
      out.push({ type: "add", text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: "remove", text: a[i++] })
  while (j < m) out.push({ type: "add", text: b[j++] })
  return out
}

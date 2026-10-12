/**
 * Minimal RFC 4180 CSV reader/writer (quoted fields, escaped quotes, commas and
 * newlines inside quotes, CRLF or LF). Enough for spreadsheet imports/exports
 * without another dependency.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // strip BOM (Excel)

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

/** Parse with a header row → one record per line (keys = header names, trimmed). */
export function parseCsvRecords(text: string): { line: number; record: Record<string, string> }[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const keys = header.map((h) => h.trim().toLowerCase())
  return rows.map((cells, i) => ({
    line: i + 2,
    record: Object.fromEntries(keys.map((k, j) => [k, (cells[j] ?? '').trim()])),
  }))
}

function escape(value: unknown): string {
  let s = value == null ? '' : String(value)
  // Spreadsheet formula injection: a text cell starting with = + - @ would run as a
  // formula when opened in Excel. Prefix a quote (numbers are left alone).
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: readonly string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(escape).join(',')).join('\n') + '\n'
}

// Helpers for the global month filter. Orders are bucketed by their date_added.

// 'YYYY-MM' key for an order's date_added, or '' if it can't be parsed.
export function orderMonthKey(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const m = String(dateStr).match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// 'YYYY-MM' -> 'June 2026'
export function monthLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/)
  if (!m) return key
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

// Distinct month keys present in a set of orders, newest first.
export function availableMonths(orders: { date_added: string | null }[]): string[] {
  const set = new Set<string>()
  for (const o of orders) {
    const k = orderMonthKey(o.date_added)
    if (k) set.add(k)
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

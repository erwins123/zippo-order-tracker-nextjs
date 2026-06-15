type Props = {
  total: number
  page: number
  pageSize: number
  onChange: (page: number) => void
}

export default function Pagination({ total, page, pageSize, onChange }: Props) {
  const pages = Math.ceil(total / pageSize)
  if (total === 0 || pages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  function getPageList(): (number | '...')[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
    const near = new Set([1, page - 1, page, page + 1, pages].filter(p => p >= 1 && p <= pages))
    const sorted = [...near].sort((a, b) => a - b)
    const result: (number | '...')[] = []
    let prev = 0
    for (const p of sorted) {
      if (p - prev > 1) result.push('...')
      result.push(p)
      prev = p
    }
    return result
  }

  return (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {getPageList().map((p, i) =>
        p === '...'
          ? <span key={`e${i}`} className="pg-ellipsis">…</span>
          : <button key={p} className={p === page ? 'active' : ''} onClick={() => onChange(p as number)}>{p}</button>
      )}
      <button disabled={page === pages} onClick={() => onChange(page + 1)}>Next →</button>
      <span className="pg-info">Showing {start}–{end} of {total}</span>
    </div>
  )
}

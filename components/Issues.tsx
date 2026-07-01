'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import type { Order, NavIntent } from '@/lib/types'
import Pagination from './ui/Pagination'

const PAGE_SIZE = 50

function badgeClass(c: string | null) {
  return (c || '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '') || 'empty'
}

// Severity accent for the card's left border, derived from the issue category
function sevColor(cat: string | null): string {
  const c = (cat || '').toUpperCase()
  if (c.includes('RETURN')) return 'var(--violet)'
  if (c.includes('STUCK') || c.includes('DELAY') || c.includes('DAYS')) return 'var(--warn)'
  if (!c) return 'var(--border-2)'
  return 'var(--bad)'
}

function daysOpen(o: Order): number {
  if (!o.date_added) return 0
  const ms = Date.now() - new Date(o.date_added).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

function ageStyle(days: number): React.CSSProperties {
  if (days >= 15) return { color: 'var(--bad)', fontWeight: 700 }
  if (days >= 7)  return { color: 'var(--warn)', fontWeight: 600 }
  return { color: 'var(--muted)', fontWeight: 500 }
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  watching: 'Watching',
  contacted: 'Contacted customer',
  resolved: 'Resolved',
}
function statusLabel(s: string | null) { return STATUS_LABELS[s || ''] || s || '' }

type Props = {
  orders: Order[]
  userEmail: string
  nav?: NavIntent | null
  allStoreNames: string[]
  onUpdateOrder: (id: string, patch: Partial<Order>) => Promise<void>
  onAddLog: (text: string) => Promise<void>
  onRunAutoFlag: () => Promise<void>
  onManageStores: () => void
  onOpenTracking: (o: Order) => void
  onBulkDelete: (ids: string[]) => Promise<void>
  onBulkSetMyStatus: (ids: string[], status: string) => Promise<void>
}

export default function Issues({
  orders, nav, onUpdateOrder, onAddLog, onRunAutoFlag,
  onManageStores, onOpenTracking, onBulkDelete, onBulkSetMyStatus,
}: Props) {
  const [storeFilter, setStoreFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('days_in_transit')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Apply a drill-down intent (Dashboard card, Stores card, or email deep-link).
  // A new object is passed on every navigation, so this re-fires each time.
  useEffect(() => {
    if (!nav) return
    if (nav.store !== undefined) setStoreFilter(nav.store)
    if (nav.type !== undefined) setTypeFilter(nav.type)
    if (nav.triage !== undefined) setStatusFilter(nav.triage)
    if (nav.search !== undefined) setSearch(nav.search)
    setPage(1)
  }, [nav])
  const [autoFlagStatus, setAutoFlagStatus] = useState('')
  const [saveHint, setSaveHint] = useState(false)
  const saveHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const flagged = orders.filter(o => o.has_issue)
  const stores = useMemo(() => [...new Set(flagged.map(o => o.store_name).filter(Boolean))].sort() as string[], [flagged])
  const types = useMemo(() => [...new Set(flagged.map(o => o.issue_category).filter(Boolean) as string[])].sort(), [flagged])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return flagged.filter(o =>
      (!storeFilter || o.store_name === storeFilter) &&
      (!typeFilter || o.issue_category === typeFilter) &&
      (!statusFilter || (statusFilter === '__open__' ? o.my_status !== 'resolved' : o.my_status === statusFilter)) &&
      (!q || JSON.stringify(o).toLowerCase().includes(q))
    )
  }, [flagged, storeFilter, typeFilter, statusFilter, search])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortKey]
    const bv = (b as Record<string, unknown>)[sortKey]
    if (typeof av === 'number' || typeof bv === 'number')
      return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir
    return String(av || '').localeCompare(String(bv || '')) * sortDir
  }), [filtered, sortKey, sortDir])

  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  )

  function flashSaved() {
    setSaveHint(true)
    if (saveHintTimer.current) clearTimeout(saveHintTimer.current)
    saveHintTimer.current = setTimeout(() => setSaveHint(false), 1200)
  }

  async function handleStatusChange(o: Order, newStatus: string) {
    const oldStatus = o.my_status
    await onUpdateOrder(o.id, { my_status: newStatus, updated_at: new Date().toISOString() })
    if (oldStatus !== newStatus) {
      await onAddLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): status ${statusLabel(oldStatus)} → ${statusLabel(newStatus)}`)
    }
    flashSaved()
  }

  function handleNotesChange(o: Order, value: string) {
    if (notesTimers.current[o.id]) clearTimeout(notesTimers.current[o.id])
    notesTimers.current[o.id] = setTimeout(async () => {
      await onUpdateOrder(o.id, { notes: value, updated_at: new Date().toISOString() })
      flashSaved()
    }, 700)
  }

  function exportCSV() {
    const headers = ['Store', 'Order #', 'Customer', 'Tracking #', 'Courier', 'Days', 'Issue', 'My status', 'Notes']
    const rows = flagged.map(o =>
      [o.store_name, o.order_num, o.customer, o.tracking_num, o.courier, o.days_in_transit, o.issue_category, statusLabel(o.my_status), o.notes]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'order_issues_export.csv'
    a.click()
  }

  async function handleAutoFlag() {
    setAutoFlagStatus('Scanning…')
    await onRunAutoFlag()
    setAutoFlagStatus(`Done · ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`)
  }

  // Bulk selection
  const allPageSelected = paginated.length > 0 && paginated.every(o => selected.has(o.id))
  const someSelected = selected.size > 0

  function toggleSelectAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPageSelected) paginated.forEach(o => next.delete(o.id))
      else paginated.forEach(o => next.add(o.id))
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected orders for everyone?`)) return
    await onBulkDelete([...selected])
    setSelected(new Set())
  }

  async function handleBulkResolve() {
    await onBulkSetMyStatus([...selected], 'resolved')
    setSelected(new Set())
    flashSaved()
  }

  return (
    <div className="view-enter">
      {/* Filter bar */}
      <div className="filter-bar">
        <select value={storeFilter} onChange={e => { setStoreFilter(e.target.value); setPage(1) }}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button className="btn-sm" onClick={onManageStores}>⚙ Stores</button>

        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
          <option value="">All issue types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All triage statuses</option>
          <option value="__open__">Needs attention (not resolved)</option>
          <option value="open">Open</option>
          <option value="watching">Watching</option>
          <option value="contacted">Contacted customer</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          value={`${sortKey}:${sortDir}`}
          onChange={e => { const [k, d] = e.target.value.split(':'); setSortKey(k); setSortDir(Number(d) as 1 | -1); setPage(1) }}
          title="Sort issues"
        >
          <option value="days_in_transit:-1">Longest in transit</option>
          <option value="date_added:1">Oldest issue first</option>
          <option value="store_name:1">Store A–Z</option>
        </select>

        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search…"
          style={{ width: 170 }}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {autoFlagStatus && <span className="sub" style={{ margin: 0, fontSize: 11.5 }}>{autoFlagStatus}</span>}
          <span className={`savehint${saveHint ? ' show' : ''}`}>Saved ✓</span>
          <button className="btn-sm" onClick={handleAutoFlag} title="Scan all orders and auto-flag ones that look stuck or not found">
            🚩 Auto-flag
          </button>
          <button className="btn-sm" onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {/* Count row */}
      <div className="sub" style={{ marginBottom: 8 }}>
        {filtered.length !== flagged.length
          ? `${filtered.length} of ${flagged.length} flagged orders`
          : `${flagged.length} flagged orders`}
        {someSelected && ` · ${selected.size} selected`}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bulk-bar">
          <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
          <strong>{selected.size} selected</strong>
          <span>·</span>
          <button className="btn-sm" onClick={handleBulkResolve}
            style={{ background: 'var(--good-bg)', color: 'var(--good)', borderColor: 'var(--good-border)' }}>
            ✓ Mark resolved
          </button>
          <button className="btn-sm btn-danger" onClick={handleBulkDelete}>Delete selected</button>
          <button
            className="btn-sm"
            style={{ marginLeft: 'auto', color: 'var(--accent-text)', borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
            onClick={() => setSelected(new Set())}
          >Clear</button>
        </div>
      )}

      {/* Issue cards */}
      {paginated.length === 0 ? (
        <div className="section" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', background: 'var(--good-bg)',
            border: '1px solid var(--good-border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5 }}>All clear</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No flagged issues match these filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paginated.map(o => (
            <div
              key={o.id}
              style={{
                background: selected.has(o.id) ? 'var(--accent-soft)' : 'var(--surface)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${sevColor(o.issue_category)}`,
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: 'var(--shadow)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                opacity: o.my_status === 'resolved' ? 0.55 : 1,
              }}
            >
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />

              <div style={{ minWidth: 170, flex: '1 1 220px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{o.customer || '—'}</span>
                  <span className={`badge badge-${badgeClass(o.issue_category)}`}>{o.issue_category || '—'}</span>
                  <span style={{ ...ageStyle(daysOpen(o)), fontSize: 11 }} title={o.date_added || ''}>{daysOpen(o)}d open</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>
                  {o.store_name || '—'} · {o.order_num || '—'} ·{' '}
                  {o.tracking_num && o.tracking_num !== '—'
                    ? <span className="trackLink" onClick={() => onOpenTracking(o)}>{o.tracking_num}</span>
                    : '—'} · {o.courier || '—'}
                </div>
              </div>

              <div style={{ flex: '1 1 150px', minWidth: 130 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{o.latest_update || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {o.days_in_transit ?? '—'} days in transit
                </div>
              </div>

              <input
                type="text"
                defaultValue={o.notes || ''}
                placeholder="Add a note…"
                style={{ width: 170, fontSize: 12 }}
                onChange={e => handleNotesChange(o, e.target.value)}
              />

              <select
                className={`statusSelect ${o.my_status || 'open'}`}
                defaultValue={o.my_status || 'open'}
                onChange={e => handleStatusChange(o, e.target.value)}
              >
                <option value="open">Open</option>
                <option value="watching">Watching</option>
                <option value="contacted">Contacted customer</option>
                <option value="resolved">Resolved</option>
              </select>

              <button className="btn-sm" onClick={() => onOpenTracking(o)}>Track</button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination (only renders when results exceed one page) */}
      {sorted.length > PAGE_SIZE && (
        <div className="tablewrap" style={{ marginTop: 12 }}>
          <Pagination
            total={sorted.length}
            page={page}
            pageSize={PAGE_SIZE}
            onChange={p => { setPage(p); setSelected(new Set()) }}
          />
        </div>
      )}
    </div>
  )
}

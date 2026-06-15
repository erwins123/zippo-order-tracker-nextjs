'use client'

import { useState, useMemo, useRef } from 'react'
import type { Order } from '@/lib/types'
import Pagination from './ui/Pagination'

const PAGE_SIZE = 50

function badgeClass(c: string | null) {
  return (c || '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '') || 'empty'
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
  orders, onUpdateOrder, onAddLog, onRunAutoFlag,
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

  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(k); setSortDir(-1) }
    setPage(1)
  }

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

  const cols = [
    { k: 'date_added',      label: 'Date'     },
    { k: 'store_name',      label: 'Store'    },
    { k: 'order_num',       label: 'Order #'  },
    { k: 'customer',        label: 'Customer' },
    { k: 'tracking_num',    label: 'Tracking' },
    { k: 'courier',         label: 'Courier'  },
    { k: 'days_in_transit', label: 'Days'     },
    { k: 'issue_category',  label: 'Issue'    },
  ]

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

      {/* Table */}
      <div className="tablewrap">
        <div className="tablewrap-scroll">
          <table>
            <thead>
              <tr>
                <th className="col-cb">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
                {cols.map(c => (
                  <th
                    key={c.k}
                    className={sortKey === c.k ? (sortDir === 1 ? 'sort-asc' : 'sort-desc') : 'sortable'}
                    onClick={() => handleSort(c.k)}
                  >{c.label}</th>
                ))}
                <th>My status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={11} className="empty">No flagged issues match these filters</td></tr>
              ) : paginated.map(o => (
                <tr
                  key={o.id}
                  className={o.my_status === 'resolved' ? 'resolved' : ''}
                  style={selected.has(o.id) ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <td className="col-cb">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  <td>{o.date_added || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{o.store_name || '—'}</td>
                  <td>{o.order_num || '—'}</td>
                  <td>{o.customer || '—'}</td>
                  <td>
                    {o.tracking_num && o.tracking_num !== '—'
                      ? <span className="trackLink" onClick={() => onOpenTracking(o)}>{o.tracking_num}</span>
                      : '—'}
                  </td>
                  <td>{o.courier || '—'}</td>
                  <td className="col-num" style={{ fontWeight: 600 }}>{o.days_in_transit ?? '—'}</td>
                  <td>
                    <span className={`badge badge-${badgeClass(o.issue_category)}`}>{o.issue_category || '—'}</span>
                  </td>
                  <td>
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
                  </td>
                  <td>
                    <input
                      type="text"
                      defaultValue={o.notes || ''}
                      placeholder="Add a note…"
                      style={{ width: 180, fontSize: 12 }}
                      onChange={e => handleNotesChange(o, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          total={sorted.length}
          page={page}
          pageSize={PAGE_SIZE}
          onChange={p => { setPage(p); setSelected(new Set()) }}
        />
      </div>
    </div>
  )
}

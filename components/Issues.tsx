'use client'

import { useState, useMemo, useRef } from 'react'
import type { Order } from '@/lib/types'

function badgeClass(c: string | null) {
  return (c || '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '') || 'empty'
}
const statusLabel = (s: string | null) =>
  ({ open: 'Open', watching: 'Watching', contacted: 'Contacted customer', resolved: 'Resolved' }[s || ''] || s || '')

type Props = {
  orders: Order[]
  allStoreNames: string[]
  onUpdateOrder: (id: string, patch: Partial<Order>) => Promise<void>
  onAddLog: (text: string) => Promise<void>
  onRunAutoFlag: () => Promise<void>
  onManageStores: () => void
  onOpenTracking: (o: Order) => void
}

export default function Issues({ orders, onUpdateOrder, onAddLog, onRunAutoFlag, onManageStores, onOpenTracking }: Props) {
  const [storeFilter, setStoreFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('days_in_transit')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
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
    if (typeof av === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir
    return String(av || '').localeCompare(String(bv || '')) * sortDir
  }), [filtered, sortKey, sortDir])

  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(k); setSortDir(-1) }
  }

  function thClass(k: string) {
    if (sortKey !== k) return 'sortable'
    return sortDir === 1 ? 'sort-asc' : 'sort-desc'
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
      await onAddLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): status changed ${statusLabel(oldStatus)} → ${statusLabel(newStatus)}`)
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
    setAutoFlagStatus('Scanning orders for ones that look stuck or stalled…')
    await onRunAutoFlag()
    const stamp = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    setAutoFlagStatus(`Auto-flag scan complete at ${stamp}.`)
  }

  const cols = [
    { k: 'date_added', label: 'Date added' },
    { k: 'store_name', label: 'Store' },
    { k: 'order_num', label: 'Order #' },
    { k: 'customer', label: 'Customer' },
    { k: 'tracking_num', label: 'Tracking #' },
    { k: 'courier', label: 'Courier' },
    { k: 'days_in_transit', label: 'Days' },
    { k: 'issue_category', label: 'Issue' },
  ]

  return (
    <div className="section view-enter">
      <div className="filters">
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" style={{ fontSize: 11, padding: '5px 10px' }} onClick={onManageStores}>⚙ Manage stores</button>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All issue types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All triage statuses</option>
          <option value="__open__">Needs attention (not resolved)</option>
          <option value="open">Open</option>
          <option value="watching">Watching</option>
          <option value="contacted">Contacted customer</option>
          <option value="resolved">Resolved</option>
        </select>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, order #, tracking #…" />
        <button onClick={handleAutoFlag} title="Scan all orders and auto-flag ones that look stuck">🚩 Auto-flag at-risk orders</button>
        {autoFlagStatus && <span className="sub" style={{ margin: 0 }}>{autoFlagStatus}</span>}
        <button onClick={exportCSV}>Export CSV</button>
        <span className={`savehint${saveHint ? ' show' : ''}`}>Saved ✓</span>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.k} className={thClass(c.k)} onClick={() => handleSort(c.k)}>{c.label}</th>
              ))}
              <th>My status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={10} className="empty">No flagged issues match these filters</td></tr>
            ) : sorted.map(o => (
              <tr key={o.id} className={o.my_status === 'resolved' ? 'resolved' : ''}>
                <td>{o.date_added || '—'}</td>
                <td>{o.store_name || '—'}</td>
                <td>{o.order_num || '—'}</td>
                <td>{o.customer || '—'}</td>
                <td>
                  {o.tracking_num && o.tracking_num !== '—'
                    ? <span className="trackLink" onClick={() => onOpenTracking(o)}>{o.tracking_num}</span>
                    : '—'}
                </td>
                <td>{o.courier || '—'}</td>
                <td>{o.days_in_transit ?? '—'}</td>
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
                    className=""
                    defaultValue={o.notes || ''}
                    placeholder="Add a note…"
                    style={{ width: 180 }}
                    onChange={e => handleNotesChange(o, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

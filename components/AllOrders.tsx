'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { Order } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'
import Pagination from './ui/Pagination'

const PAGE_SIZE = 50
const HIDE_DELIVERED_KEY = 'zippo_hide_delivered'
const DEFAULT_STORE_PREFIX = 'zippo_default_store_'
const VISIBLE_COLS_KEY = 'zippo_visible_cols'

const ALL_COLS = [
  { k: 'date_added',      label: 'Date'         },
  { k: 'store_name',      label: 'Store'         },
  { k: 'order_num',       label: 'Order #'       },
  { k: 'customer',        label: 'Customer'      },
  { k: 'tracking_num',    label: 'Tracking #'    },
  { k: 'courier',         label: 'Courier'       },
  { k: 'status',          label: 'Status'        },
  { k: 'days_in_transit', label: 'Days'          },
  { k: 'issue_category',  label: 'Flag'          },
  { k: 'latest_update',   label: 'Latest update' },
  { k: '_last_checked',   label: 'Checked'       },
]
const DEFAULT_VISIBLE = new Set(ALL_COLS.map(c => c.k))

const STATUS_PRETTY: Record<string, string> = {
  intransit: 'In Transit', delivered: 'Delivered', notfound: 'Not Found',
  pending: 'Pending', inforeceived: 'Info Received', exception: 'Exception',
  outfordelivery: 'Out for Delivery', alert: 'Alert', alertreturned: 'Alert / Returned',
  undelivered: 'Undelivered', canceled: 'Canceled', cancelled: 'Cancelled',
  updateerror: 'Update Error', registrationerror: 'Registration Error',
  onhold: 'On Hold', returnedtosender: 'Returned to Sender',
}
function prettyStatus(s: string | null) { return STATUS_PRETTY[normStatusKey(s)] || s || '' }

function fmtLastChecked(ts: number | undefined): string {
  if (!ts) return 'never'
  const diffMin = Math.round((Date.now() - ts) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`
  return `${Math.round(diffMin / 1440)}d ago`
}

function badgeClass(c: string | null) {
  return (c || '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '') || 'empty'
}

type SortDir = 1 | -1

type Props = {
  orders: Order[]
  lastLiveCheck: Record<string, number>
  allStoreNames: string[]
  userEmail: string
  onAddOrder: () => void
  onEditOrder: (o: Order) => void
  onDeleteOrder: (id: string) => void
  onOpenTracking: (o: Order) => void
  onVerifyAll: () => void
  onManageStores: () => void
  onBulkDelete: (ids: string[]) => Promise<void>
  onBulkUpdateStatus: (ids: string[], status: string) => Promise<void>
}

export default function AllOrders({
  orders, lastLiveCheck, allStoreNames, userEmail,
  onAddOrder, onEditOrder, onDeleteOrder, onOpenTracking,
  onVerifyAll, onManageStores, onBulkDelete, onBulkUpdateStatus,
}: Props) {
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('days_in_transit')
  const [sortDir, setSortDir] = useState<SortDir>(-1)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hideDelivered, setHideDelivered] = useState(false)
  const [defaultStore, setDefaultStore] = useState('')
  const [bulkStatusValue, setBulkStatusValue] = useState('intransit')
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE)
  const [colPanelOpen, setColPanelOpen] = useState(false)
  const colPanelRef = useRef<HTMLDivElement>(null)

  // Load saved preferences on mount
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_DELIVERED_KEY) === 'true') setHideDelivered(true)
      const ds = localStorage.getItem(DEFAULT_STORE_PREFIX + userEmail)
      if (ds) { setDefaultStore(ds); setStoreFilter(ds) }
      const vc = localStorage.getItem(VISIBLE_COLS_KEY)
      if (vc) {
        const parsed = JSON.parse(vc) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) setVisibleCols(new Set(parsed))
      }
    } catch {}
  }, [userEmail])

  // Close column panel on outside click
  useEffect(() => {
    if (!colPanelOpen) return
    function onMouseDown(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setColPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [colPanelOpen])

  function toggleCol(k: string) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(k)) {
        if (next.size <= 1) return prev // always keep at least one
        next.delete(k)
      } else {
        next.add(k)
      }
      try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function setAndPersistHideDelivered(v: boolean) {
    setHideDelivered(v)
    setPage(1)
    try { localStorage.setItem(HIDE_DELIVERED_KEY, String(v)) } catch {}
  }

  function saveDefaultStore(store: string) {
    setDefaultStore(store)
    try { localStorage.setItem(DEFAULT_STORE_PREFIX + userEmail, store) } catch {}
  }

  function clearDefaultStore() {
    setDefaultStore('')
    try { localStorage.removeItem(DEFAULT_STORE_PREFIX + userEmail) } catch {}
  }

  const stores = useMemo(
    () => [...new Set(orders.map(o => o.store_name).filter(Boolean))].sort() as string[],
    [orders]
  )

  const statuses = useMemo(() => {
    const seen = new Set<string>()
    return orders
      .map(o => o.status)
      .filter((s): s is string => {
        if (!s) return false
        const k = normStatusKey(s)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => prettyStatus(a).localeCompare(prettyStatus(b)))
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return orders.filter(o => {
      if (hideDelivered && normStatusKey(o.status) === 'delivered') return false
      if (storeFilter && o.store_name !== storeFilter) return false
      if (statusFilter && normStatusKey(o.status) !== normStatusKey(statusFilter)) return false
      if (q && !JSON.stringify(o).toLowerCase().includes(q)) return false
      return true
    })
  }, [orders, storeFilter, statusFilter, search, hideDelivered])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      if (typeof av === 'number' || typeof bv === 'number')
        return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir
      return String(av || '').localeCompare(String(bv || '')) * sortDir
    })
  }, [filtered, sortKey, sortDir])

  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  )

  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(k); setSortDir(-1) }
    setPage(1)
  }

  function handleStoreChange(s: string) { setStoreFilter(s); setPage(1) }

  // --- Bulk selection ---
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
    if (!confirm(`Delete ${selected.size} selected order rows for everyone?`)) return
    await onBulkDelete([...selected])
    setSelected(new Set())
  }

  async function handleBulkStatus() {
    await onBulkUpdateStatus([...selected], bulkStatusValue)
    setSelected(new Set())
  }

  const cols = ALL_COLS.filter(c => visibleCols.has(c.k))

  return (
    <div className="view-enter">
      {/* Filter bar */}
      <div className="filter-bar">
        <select value={storeFilter} onChange={e => handleStoreChange(e.target.value)}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {storeFilter && (
          storeFilter === defaultStore
            ? (
              <button
                className="btn-sm"
                onClick={clearDefaultStore}
                style={{ color: 'var(--good)', borderColor: 'var(--good-border)', background: 'var(--good-bg)' }}
                title="Click to remove saved default"
              >★ Saved default ×</button>
            ) : (
              <button className="btn-sm" onClick={() => saveDefaultStore(storeFilter)} title="Save as my default store filter">
                ☆ Save as default
              </button>
            )
        )}

        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </select>

        <div style={{ position: 'relative', width: 220 }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search customer, order #, tracking…"
            style={{ width: '100%', paddingRight: search ? 26 : undefined }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1) }}
              title="Clear search"
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'none', cursor: 'pointer', padding: 2,
                color: 'var(--muted)', fontSize: 14, lineHeight: 1, display: 'flex',
              }}
            >✕</button>
          )}
        </div>

        <button
          className="btn-sm"
          onClick={() => setAndPersistHideDelivered(!hideDelivered)}
          style={hideDelivered ? { color: 'var(--good)', borderColor: 'var(--good-border)', background: 'var(--good-bg)' } : {}}
        >
          {hideDelivered ? '✓ Hiding delivered' : 'Hide delivered'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div ref={colPanelRef} style={{ position: 'relative' }}>
            <button
              className="btn-sm"
              onClick={() => setColPanelOpen(v => !v)}
              style={colPanelOpen ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent-text)' } : {}}
            >
              Columns {visibleCols.size < ALL_COLS.length ? `(${visibleCols.size})` : ''}
            </button>
            {colPanelOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                padding: '10px 14px', minWidth: 170,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Show / hide columns
                </div>
                {ALL_COLS.map(c => (
                  <label key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                    <input
                      type="checkbox"
                      checked={visibleCols.has(c.k)}
                      onChange={() => toggleCol(c.k)}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    {c.label}
                  </label>
                ))}
                <button
                  className="btn-sm"
                  style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setVisibleCols(DEFAULT_VISIBLE)
                    try { localStorage.removeItem(VISIBLE_COLS_KEY) } catch {}
                  }}
                >Reset to default</button>
              </div>
            )}
          </div>
          <button className="btn-sm" onClick={onManageStores}>⚙ Stores</button>
          <button className="btn-sm" onClick={onVerifyAll} title="Pull live data from AfterShip">⚡ Verify all</button>
          <button className="btn-sm btn-primary" onClick={onAddOrder}>+ Add order</button>
        </div>
      </div>

      {/* Count row */}
      <div className="sub" style={{ marginBottom: 8 }}>
        {filtered.length !== orders.length
          ? `${filtered.length} of ${orders.length} orders`
          : `${orders.length} orders`}
        {hideDelivered && ' · delivered hidden'}
        {someSelected && ` · ${selected.size} selected`}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bulk-bar">
          <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} />
          <strong>{selected.size} selected</strong>
          <span>·</span>
          <span>Set status to</span>
          <select
            value={bulkStatusValue}
            onChange={e => setBulkStatusValue(e.target.value)}
            style={{ padding: '3px 8px', fontSize: 11.5, borderRadius: 6 }}
          >
            <option value="intransit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="pending">Pending</option>
            <option value="notfound">Not Found</option>
            <option value="exception">Exception</option>
            <option value="canceled">Canceled</option>
          </select>
          <button className="btn-sm" onClick={handleBulkStatus}>Apply</button>
          <span>·</span>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={cols.length + 2} className="empty">No matching orders</td></tr>
              ) : paginated.map(o => (
                <tr
                  key={o.id}
                  style={selected.has(o.id) ? { background: 'var(--accent-soft)' } : undefined}
                >
                  <td className="col-cb">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  {visibleCols.has('date_added') && <td>{o.date_added || '—'}</td>}
                  {visibleCols.has('store_name') && <td style={{ fontWeight: 500 }}>{o.store_name || '—'}</td>}
                  {visibleCols.has('order_num') && <td>{o.order_num || '—'}</td>}
                  {visibleCols.has('customer') && <td>{o.customer || '—'}</td>}
                  {visibleCols.has('tracking_num') && (
                    <td>
                      {o.tracking_num && o.tracking_num !== '—'
                        ? <span className="trackLink" onClick={() => onOpenTracking(o)}>{o.tracking_num}</span>
                        : '—'}
                    </td>
                  )}
                  {visibleCols.has('courier') && <td>{o.courier || '—'}</td>}
                  {visibleCols.has('status') && <td>{prettyStatus(o.status) || '—'}</td>}
                  {visibleCols.has('days_in_transit') && <td className="col-num" style={{ fontWeight: 600 }}>{o.days_in_transit ?? '—'}</td>}
                  {visibleCols.has('issue_category') && (
                    <td>
                      {o.issue_category
                        ? <span className={`badge badge-${badgeClass(o.issue_category)}`}>{o.issue_category}</span>
                        : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  )}
                  {visibleCols.has('latest_update') && <td title={o.latest_update || ''}>{o.latest_update || '—'}</td>}
                  {visibleCols.has('_last_checked') && <td style={{ color: 'var(--muted)' }}>{fmtLastChecked(lastLiveCheck[o.id])}</td>}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-sm" onClick={() => onEditOrder(o)}>Edit</button>{' '}
                    <button className="btn-sm btn-danger" onClick={() => onDeleteOrder(o.id)}>Delete</button>
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

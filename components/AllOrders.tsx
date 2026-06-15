'use client'

import { useState, useMemo } from 'react'
import type { Order } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'

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
  let rel: string
  if (diffMin < 1) rel = 'just now'
  else if (diffMin < 60) rel = `${diffMin}m ago`
  else if (diffMin < 1440) rel = `${Math.round(diffMin / 60)}h ago`
  else rel = `${Math.round(diffMin / 1440)}d ago`
  const abs = new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${abs} (${rel})`
}

function badgeClass(c: string | null) {
  return (c || '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '') || 'empty'
}

type SortDir = 1 | -1

type Props = {
  orders: Order[]
  lastLiveCheck: Record<string, number>
  allStoreNames: string[]
  onAddOrder: () => void
  onEditOrder: (o: Order) => void
  onDeleteOrder: (id: string) => void
  onOpenTracking: (o: Order) => void
  onVerifyAll: () => void
  onManageStores: () => void
}

export default function AllOrders({ orders, lastLiveCheck, allStoreNames, onAddOrder, onEditOrder, onDeleteOrder, onOpenTracking, onVerifyAll, onManageStores }: Props) {
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('days_in_transit')
  const [sortDir, setSortDir] = useState<SortDir>(-1)

  const stores = useMemo(() => [...new Set(orders.map(o => o.store_name).filter(Boolean))].sort() as string[], [orders])
  const seenKeys = new Set<string>()
  const statuses = useMemo(() => {
    const s: string[] = []
    ;[...orders.map(o => o.status), 'Canceled'].forEach(x => {
      if (!x) return
      const k = normStatusKey(x)
      if (seenKeys.has(k)) return
      seenKeys.add(k)
      s.push(x)
    })
    return s.sort((a, b) => prettyStatus(a).localeCompare(prettyStatus(b)))
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return orders.filter(o =>
      (!storeFilter || o.store_name === storeFilter) &&
      (!statusFilter || normStatusKey(o.status) === normStatusKey(statusFilter)) &&
      (!q || JSON.stringify(o).toLowerCase().includes(q))
    )
  }, [orders, storeFilter, statusFilter, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      if (typeof av === 'number') return ((Number(av) || 0) - (Number(bv) || 0)) * sortDir
      return String(av || '').localeCompare(String(bv || '')) * sortDir
    })
  }, [filtered, sortKey, sortDir])

  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(k); setSortDir(-1) }
  }

  function thClass(k: string) {
    if (sortKey !== k) return 'sortable'
    return sortDir === 1 ? 'sort-asc' : 'sort-desc'
  }

  const cols = [
    { k: 'date_added', label: 'Date added' },
    { k: 'store_name', label: 'Store' },
    { k: 'order_num', label: 'Order #' },
    { k: 'customer', label: 'Customer' },
    { k: 'tracking_num', label: 'Tracking #' },
    { k: 'courier', label: 'Courier' },
    { k: 'status', label: 'Status' },
    { k: 'days_in_transit', label: 'Days' },
    { k: 'issue_category', label: 'Flag' },
    { k: 'latest_update', label: 'Latest update' },
    { k: '_last_checked', label: 'Last checked' },
  ]

  return (
    <div className="section view-enter">
      <div className="filters">
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" style={{ fontSize: 11, padding: '5px 10px' }} onClick={onManageStores}>⚙ Manage stores</button>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </select>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, order #, tracking #…" />
        <button className="primary" onClick={onAddOrder}>+ Add order</button>
        <button onClick={onVerifyAll} title="Pull live data from AfterShip for every tracking number">⚡ Verify all live (AfterShip)</button>
      </div>
      <div className="sub" style={{ margin: '0 0 10px' }}>
        Showing {sorted.length} order{sorted.length === 1 ? '' : 's'} (of {orders.length} total)
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.k} className={thClass(c.k)} onClick={() => handleSort(c.k)}>{c.label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={12} className="empty">No matching orders</td></tr>
            ) : sorted.map(o => (
              <tr key={o.id}>
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
                <td>{o.status || '—'}</td>
                <td>{o.days_in_transit ?? '—'}</td>
                <td>
                  {o.issue_category
                    ? <span className={`badge badge-${badgeClass(o.issue_category)}`}>{o.issue_category}</span>
                    : '—'}
                </td>
                <td title={o.latest_update || ''}>{o.latest_update || '—'}</td>
                <td>{fmtLastChecked(lastLiveCheck[o.id])}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => onEditOrder(o)}>Edit</button>{' '}
                  <button style={{ padding: '3px 8px', fontSize: 11, color: '#dc2626' }} onClick={() => onDeleteOrder(o.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

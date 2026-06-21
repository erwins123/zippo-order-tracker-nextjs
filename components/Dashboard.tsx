'use client'

import type { Order } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'

const STATUS_PRETTY: Record<string, string> = {
  intransit: 'In Transit', delivered: 'Delivered', notfound: 'Not Found',
  pending: 'Pending', inforeceived: 'Info Received', exception: 'Exception',
  outfordelivery: 'Out for Delivery', alert: 'Alert', alertreturned: 'Alert / Returned',
  undelivered: 'Undelivered', canceled: 'Canceled', cancelled: 'Cancelled',
  onhold: 'On Hold', returnedtosender: 'Returned to Sender',
}
function prettyStatus(s: string | null) { return STATUS_PRETTY[normStatusKey(s)] || s || 'Unknown' }

function statusColor(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('deliver')) return 'var(--good)'
  if (l.includes('transit') || l.includes('out for')) return 'var(--info)'
  if (l.includes('not found') || l.includes('exception') || l.includes('alert') || l.includes('undelivered') || l.includes('returned')) return 'var(--bad)'
  if (l.includes('pending') || l.includes('info received') || l.includes('on hold')) return 'var(--warn)'
  return 'var(--muted)'
}

function HBar({ label, count, max, color, onClick }: {
  label: string; count: number; max: number; color: string; onClick?: () => void
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, cursor: onClick ? 'pointer' : undefined }}
      title={onClick ? `Click to view issues for ${label}` : undefined}
    >
      <div style={{ width: 130, fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 4, height: 14, overflow: 'hidden', minWidth: 0, border: '1px solid var(--border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, minWidth: count > 0 ? 4 : 0 }} />
      </div>
      <div style={{ width: 28, fontSize: 11.5, color: 'var(--muted)', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {count}
      </div>
    </div>
  )
}

type Props = {
  orders: Order[]
  onNavigate: (tab: string, store?: string) => void
}

export default function Dashboard({ orders, onNavigate }: Props) {
  const flagged  = orders.filter(o => o.has_issue)
  const open     = flagged.filter(o => o.my_status !== 'resolved')
  const resolved = flagged.filter(o => o.my_status === 'resolved')
  const counts: Record<string, number> = {}
  flagged.forEach(o => { counts[o.issue_category || ''] = (counts[o.issue_category || ''] || 0) + 1 })
  const delivered = orders.filter(o => normStatusKey(o.status) === 'delivered').length
  const transit   = orders.filter(o => normStatusKey(o.status) === 'intransit').length

  const cards = [
    { n: orders.length,   l: 'Total orders',          cls: 'blue',  tab: 'allorders' },
    { n: delivered,       l: 'Delivered',              cls: 'green', tab: 'allorders' },
    { n: transit,         l: 'In transit',             cls: 'blue',  tab: 'allorders' },
    { n: flagged.length,  l: 'Flagged — needs review', cls: 'red',   tab: 'issues'    },
    { n: open.length,     l: 'Open issues',            cls: 'red',   tab: 'issues'    },
    { n: resolved.length, l: 'Resolved',               cls: 'green', tab: 'issues'    },
    { n: counts['DELAYED']   || 0, l: 'Delayed',       cls: 'amber', tab: 'issues'    },
    { n: counts['NOT FOUND'] || 0, l: 'Not found',     cls: 'amber', tab: 'issues'    },
  ]

  const stores = [...new Set(orders.map(o => o.store_name))].filter(Boolean).sort() as string[]

  // Chart: open issues by store
  const issueChartData = stores
    .map(s => ({
      store: s,
      count: orders.filter(o => o.store_name === s && o.has_issue && o.my_status !== 'resolved').length,
    }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  const maxIssues = Math.max(...issueChartData.map(d => d.count), 1)

  // Chart: orders by status
  const statusMap: Record<string, number> = {}
  orders.forEach(o => {
    const label = prettyStatus(o.status)
    statusMap[label] = (statusMap[label] || 0) + 1
  })
  const statusChartData = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxStatus = Math.max(...statusChartData.map(d => d[1]), 1)

  return (
    <div className="view-enter">
      <div className="cards">
        {cards.map((c, i) => (
          <div key={i} className={`card ${c.cls} clickable`} onClick={() => onNavigate(c.tab)}>
            <div className="num">{c.n}</div>
            <div className="lbl">{c.l}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div className="section" style={{ marginBottom: 0 }}>
          <h2 style={{ marginBottom: 14 }}>
            Open issues by store
            {issueChartData.length === 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--good)', marginLeft: 8 }}>✓ All clear</span>
            )}
          </h2>
          {issueChartData.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>No open issues across any store.</div>
          ) : issueChartData.map(d => (
            <HBar
              key={d.store}
              label={d.store}
              count={d.count}
              max={maxIssues}
              color={d.count >= 6 ? 'var(--bad)' : d.count >= 3 ? 'var(--warn)' : 'var(--accent)'}
              onClick={() => onNavigate('issues', d.store)}
            />
          ))}
        </div>

        <div className="section" style={{ marginBottom: 0 }}>
          <h2 style={{ marginBottom: 14 }}>Orders by status</h2>
          {statusChartData.map(([label, count]) => (
            <HBar
              key={label}
              label={label}
              count={count}
              max={maxStatus}
              color={statusColor(label)}
            />
          ))}
        </div>
      </div>

      {/* By store table */}
      <div className="section">
        <h2>
          By store
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>— click a row to filter issues</span>
        </h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th className="col-num">Orders</th>
                <th className="col-num">Delivered</th>
                <th className="col-num">In transit</th>
                <th className="col-num">Open issues</th>
                <th className="col-num">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr><td colSpan={6} className="empty">No data yet</td></tr>
              ) : stores.map(s => {
                const rows = orders.filter(o => o.store_name === s)
                const del  = rows.filter(o => normStatusKey(o.status) === 'delivered').length
                const tr   = rows.filter(o => normStatusKey(o.status) === 'intransit').length
                const op   = rows.filter(o => o.has_issue && o.my_status !== 'resolved').length
                const res  = rows.filter(o => o.has_issue && o.my_status === 'resolved').length
                return (
                  <tr
                    key={s}
                    onClick={() => onNavigate('issues', s)}
                    style={{ cursor: 'pointer' }}
                    title={`View issues for ${s}`}
                  >
                    <td style={{ fontWeight: 500 }}>{s}</td>
                    <td className="col-num">{rows.length}</td>
                    <td className="col-num" style={{ color: del ? 'var(--good)' : 'var(--muted)' }}>{del}</td>
                    <td className="col-num" style={{ color: tr ? 'var(--info)' : 'var(--muted)' }}>{tr}</td>
                    <td className="col-num" style={{ color: op ? 'var(--bad)' : 'var(--muted)', fontWeight: op ? 700 : 400 }}>{op || '—'}</td>
                    <td className="col-num" style={{ color: res ? 'var(--good)' : 'var(--muted)' }}>{res || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

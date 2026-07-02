'use client'

import type { Order, NavIntent } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'
import { prettyStatus, statusColor } from '@/lib/status'

// Maps a stat-card color class to its accent variable (drives the dot)
function dotColor(cls: string): string {
  if (cls === 'green') return 'var(--good)'
  if (cls === 'red')   return 'var(--bad)'
  if (cls === 'amber') return 'var(--warn)'
  if (cls === 'blue')  return 'var(--info)'
  return 'var(--muted)'
}

function HBar({ label, count, max, color, onClick }: {
  label: string; count: number; max: number; color: string; onClick?: () => void
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11, cursor: onClick ? 'pointer' : undefined }}
      title={onClick ? `Click to view issues for ${label}` : undefined}
    >
      <div style={{ width: 118, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
        {label}
      </div>
      <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 18, overflow: 'hidden', minWidth: 0, border: '1px solid var(--border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5, minWidth: count > 0 ? 6 : 0 }} />
      </div>
      <div style={{ width: 24, fontSize: 12.5, color: 'var(--text)', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
        {count}
      </div>
    </div>
  )
}

type Props = {
  orders: Order[]
  onNavigate: (tab: string, nav?: NavIntent) => void
}

export default function Dashboard({ orders, onNavigate }: Props) {
  const flagged  = orders.filter(o => o.has_issue)
  const open     = flagged.filter(o => o.my_status !== 'resolved')
  const resolved = flagged.filter(o => o.my_status === 'resolved')
  const counts: Record<string, number> = {}
  flagged.forEach(o => { counts[o.issue_category || ''] = (counts[o.issue_category || ''] || 0) + 1 })
  const delivered = orders.filter(o => normStatusKey(o.status) === 'delivered').length
  const transit   = orders.filter(o => normStatusKey(o.status) === 'intransit').length

  const cards: { n: number; l: string; cls: string; tab: string; nav: NavIntent }[] = [
    { n: orders.length,   l: 'Total orders',          cls: 'gray',  tab: 'allorders', nav: { store: '' } },
    { n: delivered,       l: 'Delivered',              cls: 'green', tab: 'allorders', nav: { store: '', status: 'Delivered', hideDelivered: false } },
    { n: transit,         l: 'In transit',             cls: 'blue',  tab: 'allorders', nav: { store: '', status: 'InTransit' } },
    { n: flagged.length,  l: 'Flagged — needs review', cls: 'red',   tab: 'issues',    nav: {} },
    { n: open.length,     l: 'Open issues',            cls: 'red',   tab: 'issues',    nav: { triage: '__open__' } },
    { n: resolved.length, l: 'Resolved',               cls: 'green', tab: 'issues',    nav: { triage: 'resolved' } },
    { n: counts['DELAYED']   || 0, l: 'Delayed',       cls: 'amber', tab: 'issues',    nav: { type: 'DELAYED' } },
    { n: counts['NOT FOUND'] || 0, l: 'Not found',     cls: 'amber', tab: 'issues',    nav: { type: 'NOT FOUND' } },
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

  // Chart: orders by status. Grouped by display label — several raw tags can
  // share one label (InfoReceived + Pending -> "Awaiting carrier scan") — while
  // keeping a representative raw key so the color mapping stays accurate.
  const statusMap: Record<string, { key: string; count: number }> = {}
  orders.forEach(o => {
    const label = prettyStatus(o.status) || 'Unknown'
    if (!statusMap[label]) statusMap[label] = { key: normStatusKey(o.status) || 'unknown', count: 0 }
    statusMap[label].count++
  })
  const statusChartData = Object.entries(statusMap)
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  const maxStatus = Math.max(...statusChartData.map(d => d.count), 1)

  return (
    <div className="view-enter">
      <div className="cards">
        {cards.map((c, i) => (
          <div key={i} className={`card ${c.cls} clickable`} onClick={() => onNavigate(c.tab, c.nav)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: dotColor(c.cls) }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>
            <div className="num">{c.n}</div>
            <div className="lbl">{c.l}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div className="section" style={{ marginBottom: 0 }}>
          <h2 style={{ marginBottom: 16 }}>
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
              color={d.count >= 5 ? 'var(--bad)' : d.count >= 3 ? 'var(--warn)' : 'var(--accent)'}
              onClick={() => onNavigate('issues', { store: d.store })}
            />
          ))}
        </div>

        <div className="section" style={{ marginBottom: 0 }}>
          <h2 style={{ marginBottom: 16 }}>Orders by status</h2>
          {statusChartData.map(d => (
            <HBar
              key={d.label}
              label={d.label}
              count={d.count}
              max={maxStatus}
              color={statusColor(d.key)}
            />
          ))}
        </div>
      </div>

      {/* By store table */}
      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 style={{ padding: '18px 20px 0' }}>
          By store
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>— click a row to filter issues</span>
        </h2>
        <div className="tablewrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', marginTop: 14 }}>
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
                    onClick={() => onNavigate('issues', { store: s })}
                    style={{ cursor: 'pointer' }}
                    title={`View issues for ${s}`}
                  >
                    <td style={{ fontWeight: 600 }}>{s}</td>
                    <td className="col-num" style={{ color: 'var(--text-2)' }}>{rows.length}</td>
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

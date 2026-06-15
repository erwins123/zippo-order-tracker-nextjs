'use client'

import type { Order } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'

type Props = {
  orders: Order[]
  onNavigate: (tab: string) => void
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
    { n: orders.length,   l: 'Total orders',           cls: 'blue',  tab: 'allorders' },
    { n: delivered,       l: 'Delivered',               cls: 'green', tab: 'allorders' },
    { n: transit,         l: 'In transit',              cls: 'blue',  tab: 'allorders' },
    { n: flagged.length,  l: 'Flagged — needs review',  cls: 'red',   tab: 'issues'    },
    { n: open.length,     l: 'Open issues',             cls: 'red',   tab: 'issues'    },
    { n: resolved.length, l: 'Resolved',                cls: 'green', tab: 'issues'    },
    { n: counts['DELAYED']   || 0, l: 'Delayed',        cls: 'amber', tab: 'issues'    },
    { n: counts['NOT FOUND'] || 0, l: 'Not found',      cls: 'amber', tab: 'issues'    },
  ]

  const stores = [...new Set(orders.map(o => o.store_name))].filter(Boolean).sort() as string[]

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

      <div className="section">
        <h2>By store</h2>
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
                  <tr key={s}>
                    <td style={{ fontWeight: 500 }}>{s}</td>
                    <td className="col-num">{rows.length}</td>
                    <td className="col-num" style={{ color: del ? 'var(--good)' : 'var(--muted)' }}>{del}</td>
                    <td className="col-num" style={{ color: tr ? 'var(--info)' : 'var(--muted)' }}>{tr}</td>
                    <td className="col-num" style={{ color: op ? 'var(--bad)' : 'var(--muted)', fontWeight: op ? 700 : 400 }}>{op}</td>
                    <td className="col-num" style={{ color: res ? 'var(--good)' : 'var(--muted)' }}>{res}</td>
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

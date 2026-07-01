'use client'

import { useState, useMemo } from 'react'
import type { Order } from '@/lib/types'
import { normStatusKey } from '@/lib/autoFlag'

type Props = {
  orders: Order[]
  monthLabel: string
  onNavigate: (store: string) => void
}

type SortKey = 'orders' | 'issues' | 'delivery'

type StoreStat = {
  store: string
  total: number
  delivered: number
  transit: number
  open: number
  resolved: number
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'issues', label: 'Open issues' },
  { key: 'delivery', label: 'Delivery rate' },
]

function deliveryRate(s: StoreStat): number {
  return s.total ? s.delivered / s.total : 0
}

export default function Stores({ orders, monthLabel, onNavigate }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('orders')

  const stats = useMemo(() => {
    const map: Record<string, StoreStat> = {}
    orders.forEach(o => {
      const s = o.store_name || '—'
      if (!map[s]) map[s] = { store: s, total: 0, delivered: 0, transit: 0, open: 0, resolved: 0 }
      const st = map[s]
      st.total++
      const k = normStatusKey(o.status)
      if (k === 'delivered') st.delivered++
      else if (k === 'intransit') st.transit++
      if (o.has_issue && o.my_status !== 'resolved') st.open++
      if (o.has_issue && o.my_status === 'resolved') st.resolved++
    })
    return Object.values(map)
  }, [orders])

  const sorted = useMemo(() => {
    const arr = [...stats]
    arr.sort((a, b) => {
      if (sortKey === 'issues') return b.open - a.open || b.total - a.total
      if (sortKey === 'delivery') return deliveryRate(b) - deliveryRate(a) || b.total - a.total
      return b.total - a.total
    })
    return arr
  }, [stats, sortKey])

  const totalOrders = stats.reduce((s, x) => s + x.total, 0)
  const totalOpen = stats.reduce((s, x) => s + x.open, 0)

  const summary = [
    { n: stats.length, l: 'Active stores' },
    { n: totalOrders, l: 'Total orders' },
    { n: totalOpen, l: 'Open issues', bad: totalOpen > 0 },
  ]

  return (
    <div className="view-enter">
      {/* Summary cards */}
      <div className="cards">
        {summary.map((c, i) => (
          <div key={i} className="card">
            <div className="num" style={c.bad ? { color: 'var(--bad)' } : undefined}>{c.n}</div>
            <div className="lbl">{c.l}</div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="sub" style={{ margin: 0 }}>Sort by</span>
        {SORTS.map(s => (
          <button
            key={s.key}
            className="btn-sm"
            onClick={() => setSortKey(s.key)}
            style={sortKey === s.key
              ? { background: 'var(--accent)', color: 'var(--surface)', borderColor: 'var(--accent)' }
              : undefined}
          >
            {s.label}
          </button>
        ))}
        <span className="sub" style={{ margin: 0, marginLeft: 'auto' }}>{monthLabel}</span>
      </div>

      {/* Store cards */}
      {sorted.length === 0 ? (
        <div className="section empty">No orders for this period.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {sorted.map((s, i) => {
            const rate = Math.round(deliveryRate(s) * 100)
            const rateColor = rate >= 80 ? 'var(--good)' : rate >= 50 ? 'var(--warn)' : 'var(--bad)'
            return (
              <div
                key={s.store}
                className="section"
                style={{ margin: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12 }}
                onClick={() => onNavigate(s.store)}
                title={`View issues for ${s.store}`}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '2px 7px', flexShrink: 0,
                  }}>#{i + 1}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.store}
                  </span>
                  <span style={{
                    marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 700, color: rateColor,
                    background: 'var(--surface-2)', borderRadius: 99, padding: '2px 10px',
                  }}>{rate}% delivered</span>
                </div>

                {/* Metric tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { n: s.total, l: 'Orders', c: 'var(--text)' },
                    { n: s.delivered, l: 'Delivered', c: 'var(--good)' },
                    { n: s.transit, l: 'In transit', c: 'var(--info)' },
                    { n: s.open, l: 'Open', c: s.open ? 'var(--bad)' : 'var(--muted)' },
                  ].map((t, ti) => (
                    <div key={ti} style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: 9, padding: '9px 8px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: t.c, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{t.n}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginTop: 5 }}>{t.l}</div>
                    </div>
                  ))}
                </div>

                {/* Delivery rate bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>
                    <span>Delivery rate</span>
                    <span>{s.delivered}/{s.total}</span>
                  </div>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 4, height: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${rate}%`, height: '100%', background: rateColor, borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

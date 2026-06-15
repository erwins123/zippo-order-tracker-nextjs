'use client'

import type { Order } from '@/lib/types'
import type { TrackResult } from '@/lib/types'

type Row = { order: Order; result: TrackResult | null }

type Props = {
  open: boolean
  running: boolean
  rows: Row[]
  progress: { checked: number; total: number; text: string }
  summary: string
  skipNew: boolean
  skipDays: number
  orders: Order[]
  onClose: () => void
  onRun: () => void
  onStop: () => void
  onSkipNewChange: (v: boolean) => void
  onSkipDaysChange: (v: number) => void
  onOpenTracking: (o: Order) => void
}

export default function VerifyModal({ open, running, rows, progress, summary, skipNew, skipDays, orders, onClose, onRun, onStop, onSkipNewChange, onSkipDaysChange, onOpenTracking }: Props) {
  if (!open) return null

  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0

  return (
    <div className="modalOverlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modalBox" style={{ width: 'min(980px, 96vw)' }}>
        <h3>Live from AfterShip</h3>
        <p className="sub" style={{ margin: '-8px 0 14px' }}>
          Pulled fresh, straight from the AfterShip API, for every tracking number. Runs quietly in the background as soon as you log in — open this view any time to see results.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={skipNew} onChange={e => onSkipNewChange(e.target.checked)} />
            Skip orders added in the last
          </label>
          <select value={skipDays} onChange={e => onSkipDaysChange(Number(e.target.value))} style={{ padding: '4px 8px', fontSize: 12.5, width: 'auto' }}>
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={5}>5 days</option>
            <option value={7}>7 days</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="sub">{progress.text || 'Preparing…'}</div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', transition: 'width 0.2s' }} />
          </div>
        </div>
        <div className="tablewrap" style={{ maxHeight: '55vh' }}>
          <table>
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Store / Customer</th>
                <th>Status (live)</th>
                <th>Days in transit (live)</th>
                <th>Latest update (live)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !running && (
                <tr><td colSpan={5} className="empty">No results yet — run a verification scan to see live data.</td></tr>
              )}
              {rows.map(({ order: o, result: r }, i) => (
                <tr key={i}>
                  <td>
                    {o.tracking_num && o.tracking_num !== '—'
                      ? <span className="trackLink" onClick={() => onOpenTracking(o)}>{o.tracking_num}</span>
                      : '—'}
                  </td>
                  <td>{o.store_name || '—'} / {o.customer || '—'}</td>
                  {r && r.ok ? (
                    <>
                      <td>{r.status || r.sub_status || '—'}</td>
                      <td>{r.days_of_transit ?? '—'}</td>
                      <td title={r.latest_event || ''}>
                        {r.latest_event ? `${r.latest_event_time ? r.latest_event_time + ' | ' : ''}${r.latest_event}${r.location ? ' | ' + r.location : ''}` : '—'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} style={{ color: 'var(--bad)' }}>
                      {r ? `Live check failed: ${r.error}` : 'Checking…'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <span className="sub">{summary}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button onClick={onRun} disabled={running}>↻ Run again</button>
            <button onClick={onStop} disabled={!running}>Stop</button>
            <button className="primary" onClick={onClose}>Close</button>
          </span>
        </div>
      </div>
    </div>
  )
}

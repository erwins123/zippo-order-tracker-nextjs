'use client'

import { useState, useEffect } from 'react'
import type { Order, TrackResult, TrackEvent } from '@/lib/types'
import { track17Lookup, formatEstimatedDelivery } from '@/lib/tracking'

type Props = {
  order: Order
  orders: Order[]
  onClose: () => void
  onEdit: (o: Order) => void
  onWriteBack: (order: Order, r: Extract<TrackResult, { ok: true }>) => Promise<void>
  onRefreshAutoFlag: (id: string) => Promise<void>
  recordLastChecked: (id: string) => void
}

async function translate(text: string): Promise<string> {
  if (!text || text.trim().length < 3) return text
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text.slice(0, 500))}`
    const res = await fetch(url)
    const d = await res.json()
    return d?.[0]?.map((c: unknown[]) => c?.[0] || '').join('') || text
  } catch { return text }
}

export default function TrackDetailModal({ order, orders, onClose, onEdit, onWriteBack, onRefreshAutoFlag, recordLastChecked }: Props) {
  const [liveResult, setLiveResult] = useState<TrackResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<TrackEvent[]>([])
  const [translated, setTranslated] = useState(false)
  const [translating, setTranslating] = useState(false)

  const currentOrder = orders.find(o => o.id === order.id) || order

  async function loadLive(o: Order) {
    setLoading(true)
    setLiveResult(null)
    setEvents([])
    setTranslated(false)
    const r = await track17Lookup(o.tracking_num!)
    setLiveResult(r)
    if (r.ok) {
      recordLastChecked(o.id)
      await onWriteBack(o, r)
      await onRefreshAutoFlag(o.id)
      setEvents((r.events || []).map(e => ({ ...e })))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (order.tracking_num && order.tracking_num !== '—') loadLive(order)
    else setLoading(false)
  }, [order.id])

  async function handleTranslate() {
    if (translated) { setTranslated(false); return }
    setTranslating(true)
    const translated_events = await Promise.all(events.map(async e => ({
      ...e,
      _tr: e._tr || await translate(e.message || ''),
    })))
    setEvents(translated_events)
    setTranslated(true)
    setTranslating(false)
  }

  function copyTracking() {
    if (!order.tracking_num) return
    navigator.clipboard?.writeText(order.tracking_num).catch(() => {})
  }

  return (
    <div className="modalOverlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modalBox" style={{ width: 'min(640px, 94vw)' }}>
        <h3>Tracking details — {order.tracking_num}</h3>

        <div className="kv">
          <span>Store</span><span>{currentOrder.store_name || '—'}</span>
          <span>Customer</span><span>{currentOrder.customer || '—'}</span>
          <span>Order #</span><span>{currentOrder.order_num || '—'}</span>
          <span>Date added</span><span>{currentOrder.date_added || '—'}</span>
          <span>Courier (stored)</span><span>{currentOrder.courier || '—'}</span>
          <span>Status (stored)</span><span>{currentOrder.status || '—'}</span>
          <span>Days (stored)</span><span>{currentOrder.days_in_transit ?? '—'}</span>
          <span>Latest update (stored)</span><span title={currentOrder.latest_update || ''}>{currentOrder.latest_update || '—'}</span>
        </div>

        <div className="section" style={{ padding: '14px 16px', margin: '6px 0 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>
              Live from AfterShip{' '}
              {!loading && liveResult?.ok && <span className="sub" style={{ fontWeight: 400 }}>· just now</span>}
            </h2>
            <button style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => loadLive(order)} disabled={loading}>
              {loading ? '⌛' : '↻'} Refresh live
            </button>
          </div>

          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            {loading && <span style={{ color: 'var(--muted)' }}>Checking live data…</span>}
            {!loading && liveResult && !liveResult.ok && (
              <div>
                <span style={{ color: 'var(--bad)' }}>
                  AfterShip couldn't return live data right now — the daily API quota (100 calls/day on the free plan) may be used up, or the tracking number isn't registered yet. Try again tomorrow, or check the carrier directly:
                </span>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://t.17track.net/en#nums=${encodeURIComponent(order.tracking_num || '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-2)', fontSize: 12.5, textDecoration: 'none', border: '1px solid var(--border)' }}>
                    Open in 17TRACK ↗
                  </a>
                  <a href={`https://track.aftership.com/${encodeURIComponent(order.tracking_num || '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-2)', fontSize: 12.5, textDecoration: 'none', border: '1px solid var(--border)' }}>
                    Open in AfterShip ↗
                  </a>
                </div>
              </div>
            )}
            {!loading && liveResult?.ok && (
              <div className="kv">
                {liveResult.carrier && <><span>Carrier (live)</span><span>{liveResult.carrier}</span></>}
                <span>Status (live)</span>
                <span>{liveResult.status || '—'}{liveResult.sub_status ? ' / ' + liveResult.sub_status : ''}</span>
                <span>Days in transit (live)</span><span>{liveResult.days_of_transit ?? '—'}</span>
                {formatEstimatedDelivery(liveResult.estimated_delivery) && (
                  <><span>Estimated delivery</span><span>{formatEstimatedDelivery(liveResult.estimated_delivery)}</span></>
                )}
                {liveResult.latest_event && (
                  <><span>Latest event (live)</span>
                  <span>{liveResult.latest_event_time ? liveResult.latest_event_time + ' — ' : ''}{liveResult.latest_event}{liveResult.location ? ` (${liveResult.location})` : ''}</span></>
                )}
              </div>
            )}
          </div>

          {events.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: 12, margin: '14px 0 6px' }}>
                <span>Full tracking history</span>
                <button type="button" style={{ fontSize: 11, padding: '3px 9px' }} onClick={handleTranslate} disabled={translating}>
                  {translating ? '⌛ Translating…' : translated ? '🔤 Show original' : '🌐 Translate to English'}
                </button>
              </div>
              {events.map((ev, i) => (
                <div key={i} className="logentry">
                  <div className="t">{ev.time || '—'}{ev.location ? ' · ' + ev.location : ''}</div>
                  {translated ? (ev._tr || ev.message || '—') : (ev.message || '—')}
                </div>
              ))}
            </div>
          )}
          {!loading && liveResult?.ok && events.length === 0 && (
            <div className="sub" style={{ marginTop: 12 }}>No detailed event history available yet for this number.</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => window.open(`https://t.17track.net/en#nums=${encodeURIComponent(order.tracking_num || '')}`, '_blank', 'noopener')}>Open in 17TRACK ↗</button>
            <button onClick={() => window.open(`https://track.aftership.com/${encodeURIComponent(order.tracking_num || '')}`, '_blank', 'noopener')}>Open in AfterShip ↗</button>
            <button onClick={copyTracking}>Copy tracking #</button>
            <button onClick={() => { onClose(); onEdit(currentOrder) }}>✎ Edit order</button>
          </span>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

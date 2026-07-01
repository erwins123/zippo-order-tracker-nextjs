'use client'

import { useState, useEffect } from 'react'
import type { Order, TrackResult, TrackEvent } from '@/lib/types'
import { track17Lookup, formatEstimatedDelivery } from '@/lib/tracking'
import { friendlyStatus } from '@/lib/status'

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
          <span>Status (stored)</span>
          <span>
            {friendlyStatus(currentOrder) || '—'}
            {currentOrder.status && friendlyStatus(currentOrder).toLowerCase() !== currentOrder.status.toLowerCase() && (
              <span style={{ color: 'var(--muted)' }}> · {currentOrder.status}</span>
            )}
          </span>
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
                  AfterShip couldn&apos;t return live data right now — the daily API quota (100 calls/day on the free plan) may be used up, or the tracking number isn&apos;t registered yet. Try again tomorrow, or check the carrier directly:
                </span>
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={`https://t.17track.net/en#nums=${encodeURIComponent(order.tracking_num || '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 12.5, textDecoration: 'none', border: '1px solid var(--border)' }}>
                    Open in 17TRACK ↗
                  </a>
                  <a href={`https://track.aftership.com/${encodeURIComponent(order.tracking_num || '')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', fontSize: 12.5, textDecoration: 'none', border: '1px solid var(--border)' }}>
                    Open in AfterShip ↗
                  </a>
                </div>
              </div>
            )}
            {!loading && liveResult?.ok && (
              <div className="kv">
                {liveResult.carrier && <><span>Carrier (live)</span><span>{liveResult.carrier}</span></>}
                <span>Status (live)</span>
                <span>
                  {friendlyStatus({ status: liveResult.status, latest_update: liveResult.latest_event }) || '—'}
                  <span style={{ color: 'var(--muted)' }}> · {liveResult.status || '—'}{liveResult.sub_status ? ' / ' + liveResult.sub_status : ''}</span>
                </span>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 12, margin: '16px 0 12px' }}>
                <span>Full tracking history</span>
                <button type="button" style={{ fontSize: 11, padding: '3px 9px' }} onClick={handleTranslate} disabled={translating}>
                  {translating ? '⌛ Translating…' : translated ? '🔤 Show original' : '🌐 Translate to English'}
                </button>
              </div>
              {/* Vertical timeline */}
              <div>
                {events.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{
                        width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                        background: i === 0 ? 'var(--accent)' : 'var(--surface)',
                        border: `2px solid ${i === 0 ? 'var(--accent)' : 'var(--border-2)'}`,
                      }} />
                      {i < events.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 18 }} />}
                    </div>
                    <div style={{ paddingBottom: 16, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? 'var(--text)' : 'var(--text-2)' }}>
                        {translated ? (ev._tr || ev.message || '—') : (ev.message || '—')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
                        {ev.time || '—'}{ev.location ? ' · ' + ev.location : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!loading && liveResult?.ok && events.length === 0 && (
            <div className="sub" style={{ marginTop: 12 }}>No detailed event history available yet for this number.</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={`https://t.17track.net/en#nums=${encodeURIComponent(order.tracking_num || '')}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-sm"
            >Open in 17TRACK ↗</a>
            <a
              href={`https://track.aftership.com/${encodeURIComponent(order.tracking_num || '')}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-sm"
            >Open in AfterShip ↗</a>
            <button className="btn-sm" onClick={copyTracking}>Copy tracking #</button>
            <button className="btn-sm" onClick={() => { onClose(); onEdit(currentOrder) }}>✎ Edit order</button>
          </span>
          <button className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

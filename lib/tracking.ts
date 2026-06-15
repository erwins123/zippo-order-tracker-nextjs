import { supabase } from './supabase'
import type { TrackResult } from './types'

export async function track17Lookup(number: string): Promise<TrackResult> {
  try {
    const { data, error } = await supabase.functions.invoke('track-lookup', { body: { number } })
    if (error) return { ok: false, error: error.message || String(error) }
    const s = data?.summary
    if (!s) return { ok: false, error: 'No live tracking info available yet for this number.' }
    return {
      ok: true,
      carrier: s.carrier || null,
      status: s.status || null,
      sub_status: s.sub_status || null,
      latest_event: s.latest_event || null,
      latest_event_time: s.latest_event_time || null,
      location: s.location || null,
      days_of_transit: s.days_of_transit ?? null,
      estimated_delivery: s.estimated_delivery || null,
      events: Array.isArray(s.events) ? s.events : [],
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: 'Request failed: ' + msg }
  }
}

export function formatEstimatedDelivery(ed: unknown): string {
  if (ed == null) return ''
  if (typeof ed !== 'object') return String(ed)
  const obj = ed as Record<string, string>
  const from = obj.from || ''
  const to = obj.to || ''
  if (!from && !to) return ''
  let txt = from && to && from !== to ? `${from} – ${to}` : from || to
  if (obj.source) txt += ` (${obj.source})`
  return txt
}

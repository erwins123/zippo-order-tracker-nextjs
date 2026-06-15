import type { Order } from './types'

export const AUTO_FLAG = 'AUTO / AT RISK'
export const STUCK_DAYS_THRESHOLD = 15
const CONCERNING_STATUSES = [
  'exception', 'deliveryfailure', 'delivery failure',
  'notfound', 'not found', 'update error', 'updateerror',
]
export const MANUAL_STATUS_LOCK = [
  'canceled', 'cancelled', 'refunded', 'returned to sender', 'on hold',
]
export const SKIP_STATUSES = [
  'delivered', 'canceled', 'cancelled', 'refunded', 'returnedtosender', 'onhold',
]

export function normStatusKey(s: string | null | undefined): string {
  return String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function isAutoFlag(flag: string | null | undefined): boolean {
  const f = String(flag || '').trim()
  if (f.toUpperCase().startsWith('AUTO /')) return true
  if (CONCERNING_STATUSES.some(s => normStatusKey(f) === normStatusKey(s))) return true
  return false
}

export function computeAutoFlag(order: Order): { flag: string; category: string } | null {
  const status = normStatusKey(order.status)
  const days = Number(order.days_in_transit)
  if (status === 'delivered') return null
  if (CONCERNING_STATUSES.some(s => status === normStatusKey(s))) {
    return { flag: AUTO_FLAG, category: `AUTO / ${(order.status || 'EXCEPTION').toUpperCase()}` }
  }
  if (!isNaN(days) && days > STUCK_DAYS_THRESHOLD) {
    return { flag: AUTO_FLAG, category: `AUTO / STUCK ${days}+ DAYS IN TRANSIT` }
  }
  return null
}

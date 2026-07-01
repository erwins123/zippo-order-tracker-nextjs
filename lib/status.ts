import { normStatusKey } from './autoFlag'

// Plain-language labels for the raw carrier status tags that AfterShip / 17TRACK
// return. The raw tags ("InfoReceived", "Exception", "AttemptFail") read like
// jargon, so everywhere we show a status to the user we run it through here.
const STATUS_LABELS: Record<string, string> = {
  delivered:          'Delivered',
  intransit:          'In transit',
  outfordelivery:     'Out for delivery',
  availableforpickup: 'Ready for pickup',
  inforeceived:       'Awaiting carrier scan',
  pending:            'Awaiting carrier scan',
  exception:          'Delivery problem',
  attemptfail:        'Delivery attempted',
  deliveryfailure:    'Delivery failed',
  undelivered:        'Undelivered',
  notfound:           'Not found by carrier',
  expired:            'Tracking expired',
  returnedtosender:   'Returned to sender',
  alertreturned:      'Returned to sender',
  onhold:             'On hold',
  canceled:           'Canceled',
  cancelled:          'Canceled',
  refunded:           'Refunded',
  updateerror:        'Tracking error',
  registrationerror:  'Tracking error',
  alert:              'Needs attention',
}

// Base label from the raw status tag alone. Use this where statuses are grouped
// or listed (filter dropdowns, the dashboard "Orders by status" chart).
export function prettyStatus(s: string | null | undefined): string {
  return STATUS_LABELS[normStatusKey(s)] || s || ''
}

// Context-aware label for a single order. Same base mapping, but refined using
// the latest tracking event so common cases read clearly:
//  - any "problem" status whose latest event mentions a return -> "Returned to sender"
//  - awaiting-scan whose only event is the pre-shipment label    -> "Label made — not scanned"
const PROBLEM_KEYS = ['exception', 'attemptfail', 'deliveryfailure', 'undelivered', 'alert']
export function friendlyStatus(order: { status?: string | null; latest_update?: string | null }): string {
  const key = normStatusKey(order.status)
  if (!key) return ''
  const latest = (order.latest_update || '').toLowerCase()

  if (latest.includes('return') && PROBLEM_KEYS.includes(key)) return 'Returned to sender'

  if ((key === 'inforeceived' || key === 'pending') &&
      (latest.includes('pre-shipment') || latest.includes('pre shipment') ||
       latest.includes('shipping label') || latest.includes('label created'))) {
    return 'Label made — not scanned'
  }

  return STATUS_LABELS[key] || order.status || ''
}

// Semantic color for a status, keyed on the RAW status tag (not the label, so it
// stays correct no matter how the labels above are worded).
export function statusColor(status: string | null | undefined): string {
  const k = normStatusKey(status)
  if (k === 'delivered') return 'var(--good)'
  if (k === 'intransit' || k === 'outfordelivery' || k === 'availableforpickup') return 'var(--info)'
  if (k === 'inforeceived' || k === 'pending' || k === 'onhold') return 'var(--warn)'
  if (['exception', 'attemptfail', 'deliveryfailure', 'undelivered', 'notfound',
       'returnedtosender', 'alertreturned', 'alert', 'expired',
       'updateerror', 'registrationerror'].includes(k)) return 'var(--bad)'
  return 'var(--muted)'
}

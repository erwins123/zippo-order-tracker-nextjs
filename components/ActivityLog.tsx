'use client'

import type { LogEntry } from '@/lib/types'

function fmtTime(iso: string | null) {
  try {
    return new Date(iso!).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso || '' }
}

// Color the entry's left border by inferring the kind of event from its text
function entryColor(text: string | null): string {
  const t = (text || '').toLowerCase()
  if (t.includes('resolved') || t.includes('back on track') || t.includes('refreshed') || t.includes('delivered')) return 'var(--good)'
  if (t.includes('deleted') || t.includes('not found') || t.includes('at risk') || t.includes('flagged')) return 'var(--bad)'
  if (t.includes('contacted') || t.includes('delay')) return 'var(--warn)'
  if (t.includes('bulk') || t.includes('updated') || t.includes('edited')) return 'var(--info)'
  return 'var(--accent)'
}

export default function ActivityLog({ logRows }: { logRows: LogEntry[] }) {
  return (
    <div className="view-enter">
      <div className="section" style={{ maxWidth: 760 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Activity log
          <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13 }}>— shared across the team</span>
        </h2>
        {logRows.length === 0 ? (
          <div className="empty">No activity yet.</div>
        ) : logRows.map(l => (
          <div key={l.id} className="logentry" style={{ borderLeftColor: entryColor(l.text) }}>
            <div className="t">{fmtTime(l.ts)}{l.author ? ' · ' + l.author : ''}</div>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}

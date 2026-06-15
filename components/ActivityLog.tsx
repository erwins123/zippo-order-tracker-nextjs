'use client'

import type { LogEntry } from '@/lib/types'

function fmtTime(iso: string | null) {
  try { return new Date(iso!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso || '' }
}

export default function ActivityLog({ logRows }: { logRows: LogEntry[] }) {
  return (
    <div className="section view-enter">
      <h2>Activity log <span style={{ fontWeight: 400, color: '#9ca3af' }}>— shared across the team</span></h2>
      {logRows.length === 0 ? (
        <div className="empty">No activity yet.</div>
      ) : logRows.map(l => (
        <div key={l.id} className="logentry">
          <div className="t">{fmtTime(l.ts)}{l.author ? ' · ' + l.author : ''}</div>
          {l.text}
        </div>
      ))}
    </div>
  )
}

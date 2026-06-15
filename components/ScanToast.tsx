'use client'

import { useEffect, useRef } from 'react'

type Props = {
  data: { ts: number; by: string } | null
  onDismiss: () => void
}

export default function ScanToast({ data, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!data) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDismiss, 9000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [data])

  if (!data) return null

  const d = new Date(data.ts)
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div id="scanToast" className="show">
      <button className="st-close" onClick={onDismiss}>×</button>
      <span className="st-icon">✓</span>
      <span className="st-title">Live scan complete</span>
      <div className="st-detail">Last refreshed by {data.by} on {date} at {time}</div>
    </div>
  )
}

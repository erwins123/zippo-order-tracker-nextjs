'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { normStatusKey, isAutoFlag, computeAutoFlag, AUTO_FLAG, MANUAL_STATUS_LOCK } from '@/lib/autoFlag'
import { track17Lookup } from '@/lib/tracking'
import type { Order, LogEntry, TrackResult } from '@/lib/types'
import AuthScreen from './AuthScreen'
import Dashboard from './Dashboard'
import AllOrders from './AllOrders'
import Issues from './Issues'
import ActivityLog from './ActivityLog'
import Team from './Team'
import OrderModal from './OrderModal'
import StoreManageModal from './StoreManageModal'
import VerifyModal from './VerifyModal'
import TrackDetailModal from './TrackDetailModal'
import ScanToast from './ScanToast'

const THEME_KEY = 'order_tracker_theme'
const STORE_LIST_KEY = 'order_tracker_store_names'
const LAST_CHECKED_KEY = 'order_tracker_last_live_check'
const SCAN_COOLDOWN_MS = 12 * 60 * 60 * 1000

type Tab = 'dashboard' | 'allorders' | 'issues' | 'log' | 'team'

export type ModalOrder = Order | null
export type ScanToastData = { ts: number; by: string } | null

export default function AppShell() {
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null)
  const [currentRole, setCurrentRole] = useState<'admin' | 'member'>('member')
  const [orders, setOrders] = useState<Order[]>([])
  const [logRows, setLogRows] = useState<LogEntry[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [storeNameList, setStoreNameList] = useState<string[]>([])
  const [lastLiveCheck, setLastLiveCheck] = useState<Record<string, number>>({})
  const [subhead, setSubhead] = useState('Loading…')
  const [liveBadge, setLiveBadge] = useState('')
  const [scanToastData, setScanToastData] = useState<ScanToastData>(null)

  // Modal states
  const [orderModal, setOrderModal] = useState<{ open: boolean; order: ModalOrder }>({ open: false, order: null })
  const [storeManageOpen, setStoreManageOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [trackDetailOrder, setTrackDetailOrder] = useState<Order | null>(null)

  // Verify state (lifted so modal and background share it)
  const [verifyRunning, setVerifyRunning] = useState(false)
  const [verifyRows, setVerifyRows] = useState<{ order: Order; result: TrackResult | null }[]>([])
  const [verifyProgress, setVerifyProgress] = useState({ checked: 0, total: 0, text: '' })
  const [verifySummary, setVerifySummary] = useState('')
  const [verifySkipNew, setVerifySkipNew] = useState(true)
  const [verifySkipDays, setVerifySkipDays] = useState(3)
  const verifyStopRef = useRef(false)
  const autoLiveCheckStarted = useRef(false)

  // ----- Theme -----
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(THEME_KEY) } catch {}
    if (!saved) saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    applyTheme(saved as 'light' | 'dark')
  }, [])

  function applyTheme(t: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', t)
    setTheme(t)
    try { localStorage.setItem(THEME_KEY, t) } catch {}
  }

  function toggleTheme() { applyTheme(theme === 'dark' ? 'light' : 'dark') }

  // ----- Store list -----
  useEffect(() => {
    try { setStoreNameList(JSON.parse(localStorage.getItem(STORE_LIST_KEY) || '[]')) } catch {}
    try { setLastLiveCheck(JSON.parse(localStorage.getItem(LAST_CHECKED_KEY) || '{}')) } catch {}
  }, [])

  function persistStoreList(list: string[]) {
    setStoreNameList(list)
    try { localStorage.setItem(STORE_LIST_KEY, JSON.stringify(list)) } catch {}
  }

  function recordLastChecked(orderId: string) {
    setLastLiveCheck(prev => {
      const next = { ...prev, [orderId]: Date.now() }
      try { localStorage.setItem(LAST_CHECKED_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ----- Auth -----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) showApp(data.session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user) showApp(session.user)
      else showAuth()
    })
    return () => subscription.unsubscribe()
  }, [])

  async function showApp(user: { id: string; email?: string }) {
    const u = { id: user.id, email: user.email || '' }
    setCurrentUser(u)
    await loadAll()
    loadMyRole(u)
    checkAutoScan(u.email)
  }

  function showAuth() {
    setCurrentUser(null)
    setOrders([])
    setLogRows([])
  }

  async function signOut() { await supabase.auth.signOut() }

  // ----- Role -----
  async function loadMyRole(user: { id: string }) {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    setCurrentRole((data?.role as 'admin' | 'member') || 'member')
  }

  // ----- Data loading -----
  async function loadAll() {
    const [{ data: ordersData }, { data: logData }] = await Promise.all([
      supabase.from('orders').select('*').order('id'),
      supabase.from('activity_log').select('*').order('ts', { ascending: false }).limit(200),
    ])
    const o = (ordersData as Order[]) || []
    const l = (logData as LogEntry[]) || []
    setOrders(o)
    setLogRows(l)
    updateSubhead(o)
    return o
  }

  function updateSubhead(o: Order[]) {
    const open = o.filter(x => x.has_issue && x.my_status !== 'resolved').length
    setSubhead(`${o.length} order rows · ${new Set(o.map(x => x.store_name)).size} stores · ${open} open issues tracked`)
  }

  // ----- Realtime -----
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel('app-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => {
        supabase.from('activity_log').select('*').order('ts', { ascending: false }).limit(200).then(({ data }) => {
          if (data) setLogRows(data as LogEntry[])
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser?.id])

  // ----- CRUD helpers -----
  function whoAmI() { return currentUser?.email || 'unknown' }

  async function addLog(text: string) {
    await supabase.from('activity_log').insert({ text, author: whoAmI() })
  }

  const updateOrder = useCallback(async (id: string, patch: Partial<Order>) => {
    const fullPatch = { ...patch, updated_by: whoAmI() }
    setOrders(prev => {
      const next = prev.map(o => o.id === id ? { ...o, ...fullPatch } : o)
      updateSubhead(next)
      return next
    })
    await supabase.from('orders').update(fullPatch).eq('id', id)
  }, [currentUser])

  async function insertOrder(row: Partial<Order>): Promise<Order | null> {
    const fullRow = { ...row, updated_by: whoAmI() }
    const { data, error } = await supabase.from('orders').insert(fullRow).select()
    if (error) { alert('Could not save: ' + error.message); return null }
    if (data?.[0]) setOrders(prev => { const next = [...prev, data[0] as Order]; updateSubhead(next); return next })
    return data?.[0] as Order || null
  }

  async function deleteOrder(id: string) {
    const o = orders.find(x => x.id === id)
    if (!o) return
    if (!confirm(`Delete this order row?\n\n${o.store_name} · ${o.customer || '—'} · ${o.tracking_num || '—'}\n\nThis removes it for everyone.`)) return
    setOrders(prev => { const next = prev.filter(x => x.id !== id); updateSubhead(next); return next })
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) { alert('Delete failed: ' + error.message); await loadAll(); return }
    await addLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): order row deleted`)
  }

  // ----- Write live result back -----
  const writeLiveResultBack = useCallback(async (order: Order, r: Extract<TrackResult, { ok: true }>) => {
    const liveStatus = r.status || r.sub_status
    const liveIsNotFound = normStatusKey(liveStatus) === 'notfound'
    const storedLooksReal = (normStatusKey(order.status) && normStatusKey(order.status) !== 'notfound') || (Number(order.days_in_transit) > 0)
    if (liveIsNotFound && storedLooksReal) return

    const patch: Partial<Order> = {}
    if (r.carrier) patch.courier = r.carrier
    const statusLocked = MANUAL_STATUS_LOCK.includes(String(order.status || '').trim().toLowerCase())
    if (liveStatus && !statusLocked) patch.status = liveStatus
    if (r.days_of_transit !== null && r.days_of_transit !== undefined) patch.days_in_transit = r.days_of_transit
    if (r.latest_event) {
      patch.latest_update = `${r.latest_event_time ? r.latest_event_time + ' | ' : ''}${r.latest_event}${r.location ? ' | ' + r.location : ''}`
    }
    if (!Object.keys(patch).length) return
    const changed = Object.keys(patch).some(k => String((order as Record<string, unknown>)[k] ?? '') !== String((patch as Record<string, unknown>)[k] ?? ''))
    if (!changed) return
    patch.updated_at = new Date().toISOString()
    await updateOrder(order.id, patch)
  }, [updateOrder])

  // ----- Auto-flag -----
  async function refreshAutoFlagForOrder(orderId: string) {
    const o = orders.find(x => x.id === orderId)
    if (!o) return
    const suggestion = computeAutoFlag(o)
    const hasAutoFlag = isAutoFlag(o.issue_flag) || isAutoFlag(o.issue_category)
    if (suggestion) {
      if ((!o.has_issue || hasAutoFlag) && (o.issue_flag !== suggestion.flag || o.issue_category !== suggestion.category || !o.has_issue)) {
        await updateOrder(o.id, { issue_flag: suggestion.flag, issue_category: suggestion.category, has_issue: true, updated_at: new Date().toISOString() })
        await addLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): auto-flagged as at risk — ${suggestion.category}`)
      }
    } else if (hasAutoFlag) {
      await updateOrder(o.id, { issue_flag: '', issue_category: '', has_issue: false, updated_at: new Date().toISOString() })
      await addLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): auto-flag cleared — order looks back on track`)
    }
  }

  async function runAutoFlag(silent = false, currentOrders?: Order[]) {
    const targets = currentOrders || orders
    let flagged = 0, cleared = 0
    for (const o of targets) {
      const suggestion = computeAutoFlag(o)
      const hasAutoFlag = isAutoFlag(o.issue_flag)
      if (suggestion) {
        if (!o.has_issue || hasAutoFlag) {
          if (o.issue_flag !== suggestion.flag || o.issue_category !== suggestion.category || !o.has_issue) {
            await updateOrder(o.id, { issue_flag: suggestion.flag, issue_category: suggestion.category, has_issue: true, updated_at: new Date().toISOString() })
            await addLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): auto-flagged as at risk — ${suggestion.category}`)
            flagged++
          }
        }
      } else if (hasAutoFlag) {
        await updateOrder(o.id, { issue_flag: '', issue_category: '', has_issue: false, updated_at: new Date().toISOString() })
        await addLog(`${o.store_name} · ${o.customer || '—'} (${o.tracking_num || '—'}): auto-flag cleared — order looks back on track`)
        cleared++
      }
    }
    return { scanned: targets.length, flagged, cleared }
  }

  // ----- Verify all live -----
  async function runVerifyAll(currentOrdersOverride?: Order[]) {
    if (verifyRunning) return
    setVerifyRunning(true)
    verifyStopRef.current = false
    setVerifyRows([])
    setVerifySummary('')
    setVerifyProgress({ checked: 0, total: 0, text: 'Starting…' })

    const scanBy = currentUser?.email || 'unknown'
    await supabase.from('app_settings').upsert({ key: 'last_live_scan', value: JSON.stringify({ ts: Date.now(), by: scanBy }), updated_at: new Date().toISOString() })

    const SKIP = ['delivered', 'canceled', 'cancelled', 'refunded', 'returnedtosender', 'onhold']
    const cutoff = verifySkipNew ? Date.now() - verifySkipDays * 86400000 : null
    const allOrders = currentOrdersOverride || orders
    const targets = allOrders.filter(o => {
      if (!o.tracking_num || o.tracking_num === '—') return false
      if (SKIP.includes(normStatusKey(o.status))) return false
      if (cutoff && o.date_added) {
        const added = new Date(o.date_added).getTime()
        if (!isNaN(added) && added > cutoff) return false
      }
      return true
    })

    setVerifyProgress({ checked: 0, total: targets.length, text: `Checking 0 of ${targets.length}…` })
    setLiveBadge(`Checking live AfterShip data in the background… 0 / ${targets.length}`)

    let ok = 0, failed = 0
    const newRows: { order: Order; result: TrackResult | null }[] = []

    for (let i = 0; i < targets.length; i++) {
      if (verifyStopRef.current) break
      const o = targets[i]
      setVerifyProgress({ checked: i + 1, total: targets.length, text: `Checking ${i + 1} of ${targets.length}: ${o.tracking_num}…` })
      const r = await track17Lookup(o.tracking_num!)
      if (r.ok) {
        ok++
        recordLastChecked(o.id)
        await writeLiveResultBack(o, r)
        newRows.push({ order: o, result: r })
      } else {
        failed++
        newRows.push({ order: o, result: r })
      }
      setVerifyRows([...newRows])
      setLiveBadge(`Checking live AfterShip data… ${i + 1} / ${targets.length}`)
      await new Promise(res => setTimeout(res, 450))
    }

    const checked = verifyStopRef.current ? newRows.length : targets.length
    const skipped = allOrders.length - targets.length
    const stamp = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

    if (!verifyStopRef.current) {
      await supabase.from('app_settings').upsert({ key: 'last_live_scan', value: JSON.stringify({ ts: Date.now(), by: scanBy }), updated_at: new Date().toISOString() })
      setLiveBadge(`✓ Live AfterShip data refreshed at ${stamp} (${ok}/${targets.length} OK) — click to view results`)
      await runAutoFlag(true)
    } else {
      setLiveBadge(`Live check stopped early (${checked}/${targets.length}) at ${stamp} — click to view results`)
    }

    setVerifySummary(`${ok} retrieved · ${failed} couldn't be checked live${skipped ? ` · ${skipped} skipped` : ''}`)
    setVerifyProgress({ checked, total: targets.length, text: verifyStopRef.current ? `Stopped after ${checked} of ${targets.length}.` : `Done — pulled live data for ${checked} of ${targets.length} from AfterShip.` })
    setVerifyRunning(false)
  }

  // ----- Auto scan on login -----
  async function checkAutoScan(email: string) {
    if (autoLiveCheckStarted.current) return
    autoLiveCheckStarted.current = true
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'last_live_scan').single()
      let scanTs = 0, scanBy = 'a teammate'
      try {
        const parsed = JSON.parse(data?.value || '0')
        if (typeof parsed === 'object' && parsed.ts) { scanTs = parsed.ts; scanBy = parsed.by || scanBy }
        else scanTs = parseInt(data?.value || '0', 10)
      } catch { scanTs = parseInt(data?.value || '0', 10) }

      if (Date.now() - scanTs > SCAN_COOLDOWN_MS) {
        setTimeout(() => runVerifyAll(), 500)
      } else {
        setTimeout(() => setScanToastData({ ts: scanTs, by: scanBy }), 800)
        const stamp = new Date(scanTs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        setLiveBadge(`✓ Tracking data up to date · last refreshed by ${scanBy} at ${stamp}`)
      }
    } catch {}
  }

  // ----- All store names (list + from orders) -----
  function allStoreNames() {
    const fromOrders = [...new Set(orders.map(o => o.store_name).filter(Boolean) as string[])]
    return [...new Set([...storeNameList, ...fromOrders])].sort(naturalStoreCompare)
  }

  function naturalStoreCompare(a: string, b: string) {
    const ma = a.match(/^\s*(\d+)/), mb = b.match(/^\s*(\d+)/)
    if (ma && mb) { const d = parseInt(ma[1]) - parseInt(mb[1]); if (d !== 0) return d }
    else if (ma && !mb) return -1
    else if (!ma && mb) return 1
    return a.localeCompare(b)
  }

  if (!currentUser) {
    return <AuthScreen theme={theme} toggleTheme={toggleTheme} />
  }

  return (
    <>
      <div className="titlewrap">
        <h1>
          <span className="live-dot" />
          ZIPPO CLUB ORDER TRACKER{' '}
          <span style={{ fontSize: 12, fontWeight: 400, fontFamily: 'Inter, sans-serif', color: 'var(--muted)' }}>— shared, live</span>
        </h1>
        <div className="topRight">
          <div className="userChip">
            <span className="av">{(currentUser.email || '?').charAt(0).toUpperCase()}</span>
            <span>{currentUser.email}</span>
            <button onClick={signOut}>Sign out</button>
          </div>
          <div className="themeToggle" onClick={toggleTheme}>
            <span className="dot" />
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          </div>
        </div>
      </div>

      <div className="sub" style={{ marginBottom: 4 }}>{subhead} <span style={{ color: '#16a34a' }}>● live — synced with your team</span></div>
      {liveBadge && (
        <div className="sub" style={{ margin: '2px 0 18px', cursor: 'pointer' }} onClick={() => setVerifyOpen(true)}>
          {liveBadge}
        </div>
      )}

      <div className="tabs">
        {(['dashboard', 'allorders', 'issues', 'log'] as Tab[]).map(t => (
          <div key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
            {t === 'dashboard' ? 'Dashboard' : t === 'allorders' ? 'All orders' : t === 'issues' ? 'Issues' : 'Activity log'}
          </div>
        ))}
        {currentRole === 'admin' && (
          <div className={`tab${activeTab === 'team' ? ' active' : ''}`} onClick={() => setActiveTab('team')}>Team</div>
        )}
      </div>

      {activeTab === 'dashboard' && (
        <Dashboard orders={orders} onNavigate={(tab, filters) => { setActiveTab(tab as Tab) }} />
      )}
      {activeTab === 'allorders' && (
        <AllOrders
          orders={orders}
          lastLiveCheck={lastLiveCheck}
          onAddOrder={() => setOrderModal({ open: true, order: null })}
          onEditOrder={o => setOrderModal({ open: true, order: o })}
          onDeleteOrder={deleteOrder}
          onOpenTracking={o => setTrackDetailOrder(o)}
          onVerifyAll={() => { setVerifyOpen(true); if (!verifyRunning) runVerifyAll() }}
          onManageStores={() => setStoreManageOpen(true)}
          allStoreNames={allStoreNames()}
        />
      )}
      {activeTab === 'issues' && (
        <Issues
          orders={orders}
          onUpdateOrder={updateOrder}
          onAddLog={addLog}
          onRunAutoFlag={async () => { await runAutoFlag(false) }}
          onManageStores={() => setStoreManageOpen(true)}
          onOpenTracking={o => setTrackDetailOrder(o)}
          allStoreNames={allStoreNames()}
        />
      )}
      {activeTab === 'log' && <ActivityLog logRows={logRows} />}
      {activeTab === 'team' && currentRole === 'admin' && (
        <Team currentUserId={currentUser.id} onAddLog={addLog} />
      )}

      <footer>Shared live tracker — backed by a team database. Status changes and notes sync for everyone in real time.</footer>

      <OrderModal
        open={orderModal.open}
        order={orderModal.order}
        allStoreNames={allStoreNames()}
        onClose={() => setOrderModal({ open: false, order: null })}
        onSave={async (payload, isEdit) => {
          if (isEdit && orderModal.order) {
            await updateOrder(orderModal.order.id, payload)
            await addLog(`${payload.store_name} · ${payload.customer || '—'} (${payload.tracking_num || '—'}): order details edited`)
          } else {
            const saved = await insertOrder(payload)
            if (saved) await addLog(`${payload.store_name} · ${payload.customer || '—'} (${payload.tracking_num || '—'}): new order added`)
          }
          setOrderModal({ open: false, order: null })
        }}
        onManageStores={() => setStoreManageOpen(true)}
      />

      <StoreManageModal
        open={storeManageOpen}
        storeNameList={storeNameList}
        ordersUsingStore={(name: string) => orders.some(o => o.store_name === name)}
        onClose={() => setStoreManageOpen(false)}
        onUpdate={persistStoreList}
      />

      <VerifyModal
        open={verifyOpen}
        running={verifyRunning}
        rows={verifyRows}
        progress={verifyProgress}
        summary={verifySummary}
        skipNew={verifySkipNew}
        skipDays={verifySkipDays}
        orders={orders}
        onClose={() => setVerifyOpen(false)}
        onRun={() => { verifyStopRef.current = false; runVerifyAll() }}
        onStop={() => { verifyStopRef.current = true }}
        onSkipNewChange={setVerifySkipNew}
        onSkipDaysChange={setVerifySkipDays}
        onOpenTracking={o => setTrackDetailOrder(o)}
      />

      {trackDetailOrder && (
        <TrackDetailModal
          order={trackDetailOrder}
          orders={orders}
          onClose={() => setTrackDetailOrder(null)}
          onEdit={o => { setTrackDetailOrder(null); setOrderModal({ open: true, order: o }) }}
          onWriteBack={writeLiveResultBack}
          onRefreshAutoFlag={refreshAutoFlagForOrder}
          recordLastChecked={recordLastChecked}
        />
      )}

      <ScanToast data={scanToastData} onDismiss={() => setScanToastData(null)} />
    </>
  )
}

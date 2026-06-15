'use client'

import type { Order } from '@/lib/types'

const MANUAL_STATUS_SUGGESTIONS = ['Canceled', 'Refunded', 'Returned to sender', 'On hold']

type Props = {
  open: boolean
  order: Order | null
  allStoreNames: string[]
  onClose: () => void
  onSave: (payload: Partial<Order>, isEdit: boolean) => Promise<void>
  onManageStores: () => void
}

export default function OrderModal({ open, order, allStoreNames, onClose, onSave, onManageStores }: Props) {
  if (!open) return null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const store_name = fd.get('store_name') as string
    if (!store_name) { alert('Store name is required.'); return }
    const issue_flag = (fd.get('issue_flag') as string).trim()
    const payload: Partial<Order> = {
      store_name,
      order_num: (fd.get('order_num') as string).trim() || null,
      customer: (fd.get('customer') as string).trim() || null,
      tracking_num: (fd.get('tracking_num') as string).trim() || null,
      date_added: (fd.get('date_added') as string) || null,
      status: (fd.get('status') as string) || null,
      issue_flag,
      issue_category: ((fd.get('issue_category') as string).trim()) || (issue_flag ? 'OTHER' : ''),
      has_issue: !!issue_flag,
      updated_at: new Date().toISOString(),
    }
    if (!order) {
      payload.courier = null
      payload.days_in_transit = null
      payload.latest_update = null
      payload.id = 'ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      payload.my_status = 'open'
      payload.notes = ''
    }
    await onSave(payload, !!order)
  }

  return (
    <div className="modalOverlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modalBox">
        <h3>{order ? 'Edit order' : 'Add order'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="modalGrid">
            <label style={{ gridColumn: '1/-1' }}>
              Store name
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <select name="store_name" defaultValue={order?.store_name || ''} style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                  <option value="">— select a store —</option>
                  {allStoreNames.map(n => <option key={n} value={n}>{n}</option>)}
                  {order?.store_name && !allStoreNames.includes(order.store_name) && (
                    <option value={order.store_name}>{order.store_name}</option>
                  )}
                </select>
                <button type="button" style={{ fontSize: 11, padding: '0 12px', whiteSpace: 'nowrap' }} onClick={onManageStores}>⚙ Manage stores</button>
              </div>
            </label>
            <label>Order #<br /><input type="text" name="order_num" defaultValue={order?.order_num || ''} style={{ width: '100%' }} /></label>
            <label>Customer<br /><input type="text" name="customer" defaultValue={order?.customer || ''} style={{ width: '100%' }} /></label>
            <label>Tracking #<br /><input type="text" name="tracking_num" defaultValue={order?.tracking_num || ''} style={{ width: '100%' }} /></label>
            <label>Date added<br /><input type="date" name="date_added" defaultValue={order?.date_added || ''} style={{ width: '100%' }} /></label>
            <label>
              Status
              <select name="status" defaultValue={order?.status || ''} style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}>
                <option value="">— auto (let live checks fill this in) —</option>
                {MANUAL_STATUS_SUGGESTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                {order?.status && !MANUAL_STATUS_SUGGESTIONS.includes(order.status) && (
                  <option value={order.status}>{order.status}</option>
                )}
              </select>
            </label>
            <label>Issue flag<br /><input type="text" name="issue_flag" defaultValue={order?.issue_flag || ''} style={{ width: '100%' }} placeholder="leave blank if none" /></label>
            <label>Issue category<br /><input type="text" name="issue_category" defaultValue={order?.issue_category || ''} style={{ width: '100%' }} placeholder="e.g. DELAYED, NOT FOUND" /></label>
          </div>
          <p className="sub" style={{ margin: '12px 0 0', fontSize: 11.5 }}>
            Courier, days in transit and latest update are populated automatically by the scheduled tracking checks.
            Status is usually auto-populated too — only set it manually for things like <strong>Canceled</strong>.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

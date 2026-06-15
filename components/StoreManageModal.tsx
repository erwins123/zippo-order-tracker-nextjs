'use client'

import { useState } from 'react'

type Props = {
  open: boolean
  storeNameList: string[]
  ordersUsingStore: (name: string) => boolean
  onClose: () => void
  onUpdate: (list: string[]) => void
}

function naturalSort(a: string, b: string) {
  const ma = a.match(/^\s*(\d+)/), mb = b.match(/^\s*(\d+)/)
  if (ma && mb) { const d = parseInt(ma[1]) - parseInt(mb[1]); if (d !== 0) return d }
  else if (ma && !mb) return -1
  else if (!ma && mb) return 1
  return a.localeCompare(b)
}

function allNames(list: string[], fromOrders: string[]) {
  return [...new Set([...list, ...fromOrders])].sort(naturalSort)
}

export default function StoreManageModal({ open, storeNameList, ordersUsingStore, onClose, onUpdate }: Props) {
  const [newName, setNewName] = useState('')

  if (!open) return null

  function addStore() {
    const name = newName.trim()
    if (!name) return
    if (!storeNameList.includes(name)) onUpdate([...storeNameList, name])
    setNewName('')
  }

  function removeStore(name: string) {
    const inUse = ordersUsingStore(name)
    if (inUse && !confirm(`"${name}" is still used by existing orders. Remove it from the dropdown list anyway?`)) return
    onUpdate(storeNameList.filter(s => s !== name))
  }

  const names = allNames(storeNameList, [])

  return (
    <div className="modalOverlay show" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modalBox" style={{ width: 'min(420px, 92vw)' }}>
        <h3>Manage stores</h3>
        <p className="sub" style={{ margin: '-8px 0 14px', fontSize: 12 }}>
          Add or remove store names from the dropdown list. Removing a name here only affects future selections — it won't change existing orders.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addStore() }}
            placeholder="New store name"
            style={{ flex: 1, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
          />
          <button className="primary" type="button" onClick={addStore}>Add</button>
        </div>
        <div style={{ maxHeight: 260, overflow: 'auto' }}>
          {names.length === 0 ? (
            <div className="empty">No stores yet — add one above.</div>
          ) : names.map(n => (
            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{n}</span>
              <button type="button" onClick={() => removeStore(n)} style={{ fontSize: 11, padding: '3px 9px', color: '#dc2626' }}>Remove</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

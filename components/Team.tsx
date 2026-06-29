'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

type Props = {
  currentUserId: string
  onAddLog: (text: string) => Promise<void>
}

export default function Team({ currentUserId, onAddLog }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([])

  async function loadTeam() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    if (data) setProfiles(data as Profile[])
  }

  useEffect(() => { loadTeam() }, [])

  async function changeRole(id: string, role: string) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) { alert('Could not update role: ' + error.message); loadTeam(); return }
    await onAddLog(`Changed a teammate's role to "${role}"`)
    loadTeam()
  }

  return (
    <div className="view-enter">
      <div className="section" style={{ marginBottom: 16 }}>
        <h2>Team <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— admin only: manage who can sign in and their role</span></h2>
        <p className="sub" style={{ marginBottom: 0 }}>
          To add or remove a teammate&apos;s login entirely, do that in Supabase → Authentication → Users.
          Here you can promote/demote existing teammates between <b>admin</b> and <b>member</b>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 13 }}>
        {profiles.map(p => {
          const isMe = p.id === currentUserId
          const isAdmin = (p.role || 'member') === 'admin'
          return (
            <div
              key={p.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: isAdmin ? 'var(--accent)' : 'var(--surface-2)',
                  color: isAdmin ? 'var(--surface)' : 'var(--text)',
                  border: isAdmin ? 'none' : '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800,
                }}>
                  {(p.email || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.email || '—'}
                    {isMe && <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500 }}> (you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    Joined {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700 }}>Role</span>
                <select
                  defaultValue={p.role || 'member'}
                  disabled={isMe}
                  title={isMe ? "You can't change your own role" : undefined}
                  onChange={e => changeRole(p.id, e.target.value)}
                  style={{ marginLeft: 'auto', minWidth: 120 }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
    <div className="section view-enter">
      <h2>Team <span style={{ fontWeight: 400, color: '#9ca3af' }}>— admin only: manage who can sign in and their role</span></h2>
      <p className="sub" style={{ marginBottom: 14 }}>
        To add or remove a teammate's login entirely, do that in Supabase → Authentication → Users.
        Here you can promote/demote existing teammates between <b>admin</b> and <b>member</b>.
      </p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>
            {profiles.map(p => {
              const isMe = p.id === currentUserId
              return (
                <tr key={p.id}>
                  <td>{p.email || '—'}{isMe && <span style={{ color: 'var(--muted)', fontSize: 11 }}> (you)</span>}</td>
                  <td>
                    <select
                      defaultValue={p.role || 'member'}
                      disabled={isMe}
                      title={isMe ? "You can't change your own role" : undefined}
                      onChange={e => changeRole(p.id, e.target.value)}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

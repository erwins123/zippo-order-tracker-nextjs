'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export default function AuthScreen({ theme, toggleTheme }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ text: string; kind: 'err' | 'ok' } | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!email || !password) { setMsg({ text: 'Enter your email and password.', kind: 'err' }); return }
    setLoading(true)
    setMsg(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) { setMsg({ text: error.message, kind: 'err' }) }
        else if (data.user && !data.session) {
          setMsg({ text: 'Account created — check your email to confirm, then sign in.', kind: 'ok' })
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg({ text: error.message, kind: 'err' })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) { if (e.key === 'Enter') submit() }

  return (
    <div className="authScreen">
      <div className="authBox">
        <h1>ZIPPO CLUB ORDER TRACKER</h1>
        <div className="sub">Sign in with your team account to continue</div>
        {msg && <div className={`authMsg show ${msg.kind}`}>{msg.text}</div>}
        <label>
          Email
          <input type="text" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} autoComplete="username" placeholder="you@yourteam.com" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} autoComplete="current-password" placeholder="••••••••" />
        </label>
        <button className="primary" onClick={submit} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <div className="authSwitch">
          {mode === 'signin' ? (
            <>New here? <a onClick={() => { setMode('signup'); setMsg(null) }}>Create an account</a></>
          ) : (
            <>Already have an account? <a onClick={() => { setMode('signin'); setMsg(null) }}>Sign in</a></>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div className="themeToggle" onClick={toggleTheme} style={{ display: 'inline-flex' }}>
            <span className="dot" />
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

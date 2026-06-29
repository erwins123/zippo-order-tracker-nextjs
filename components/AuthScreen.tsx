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
  const [showPw, setShowPw] = useState(false)

  async function submit() {
    if (!email || !password) { setMsg({ text: 'Enter your email and password.', kind: 'err' }); return }
    setLoading(true)
    setMsg(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) setMsg({ text: error.message, kind: 'err' })
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
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: '#c5f02e',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1916" strokeWidth={2} strokeLinecap="round">
              <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
              <path d="M16 3H8L6 7h12l-2-4z"/>
              <path d="M12 12v4M10 14h4"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.3 }}>
            Zippo Club
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Order Tracker</div>
        </div>

        <div className="authBox">
          <h1 style={{ fontSize: 18, marginBottom: 4 }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h1>
          <div className="sub" style={{ marginBottom: 22, fontSize: 13 }}>
            {mode === 'signin'
              ? 'Sign in with your team account to continue'
              : 'Create an account and ask an admin to approve you'}
          </div>

          {msg && <div className={`authMsg show ${msg.kind}`}>{msg.text}</div>}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="username"
              placeholder="you@yourteam.com"
            />
          </label>

          <label>
            Password
            <div style={{ position: 'relative', marginTop: 5 }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                style={{ width: '100%', marginTop: 0, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 12,
                }}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button className="primary" onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>

          <div className="authSwitch">
            {mode === 'signin' ? (
              <>New to the team? <a onClick={() => { setMode('signup'); setMsg(null) }}>Create an account</a></>
            ) : (
              <>Already have an account? <a onClick={() => { setMode('signin'); setMsg(null) }}>Sign in</a></>
            )}
          </div>
        </div>

        <div className="auth-theme-row">
          <button className="auth-theme-btn" onClick={toggleTheme}>
            <span style={{ fontSize: 14 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
            Switch to {theme === 'dark' ? 'light' : 'dark'} mode
          </button>
        </div>
      </div>
    </div>
  )
}

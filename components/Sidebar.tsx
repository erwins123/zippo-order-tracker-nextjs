'use client'

type Tab = 'dashboard' | 'allorders' | 'issues' | 'stores' | 'log' | 'team'

type Props = {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  userEmail: string
  currentRole: 'admin' | 'member'
  theme: 'light' | 'dark'
  toggleTheme: () => void
  onSignOut: () => void
  openIssueCount: number
  mobileOpen: boolean
  onCloseMobile: () => void
  liveBadge: string
  onOpenVerify: () => void
}

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  allorders: 'All orders',
  issues: 'Issues',
  stores: 'Stores',
  log: 'Activity log',
  team: 'Team',
}

function NavIcon({ tab }: { tab: Tab }) {
  const s = 'currentColor'
  const w = 1.8
  switch (tab) {
    case 'dashboard':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
    case 'allorders':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><path d="M4 6h16M4 10h16M4 14h10M4 18h7" strokeLinecap="round"/></svg>
    case 'issues':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'stores':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><path d="M3 9l1.5-5.5A1 1 0 015.46 3h13.08a1 1 0 01.96.5L21 9M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9M3 9h18M8 9v3a2 2 0 01-4 0M12 9v3a2 2 0 01-4 0M16 9v3a2 2 0 01-4 0M20 9v3a2 2 0 01-4 0" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'log':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    case 'team':
      return <svg viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth={w}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  }
}

export default function Sidebar({
  activeTab, onTabChange, userEmail, currentRole, theme, toggleTheme,
  onSignOut, openIssueCount, mobileOpen, onCloseMobile, liveBadge, onOpenVerify,
}: Props) {
  const tabs: Tab[] = ['dashboard', 'allorders', 'issues', 'stores', 'log', ...(currentRole === 'admin' ? ['team' as Tab] : [])]

  return (
    <>
      <div className={`mobile-nav-overlay${mobileOpen ? ' show' : ''}`} onClick={onCloseMobile} />

      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-name">ZIPPO CLUB</div>
          <div className="sidebar-logo-sub">
            <span className="live-dot" />
            Order Tracker · live
          </div>
        </div>

        <nav className="sidebar-nav">
          {tabs.map(tab => (
            <div
              key={tab}
              className={`sidebar-nav-item${activeTab === tab ? ' active' : ''}`}
              onClick={() => { onTabChange(tab); onCloseMobile() }}
            >
              <NavIcon tab={tab} />
              {TAB_LABELS[tab]}
              {tab === 'issues' && openIssueCount > 0 && (
                <span className="sidebar-badge">{openIssueCount > 99 ? '99+' : openIssueCount}</span>
              )}
            </div>
          ))}
        </nav>

        {liveBadge && (
          <div className="sidebar-live-badge" onClick={onOpenVerify}>
            <div className="sidebar-live-badge-text">{liveBadge}</div>
          </div>
        )}

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{(userEmail || '?').charAt(0).toUpperCase()}</div>
            <span className="sidebar-user-email">{userEmail}</span>
          </div>
          <div className="sidebar-bottom-actions">
            <div className="sidebar-theme-toggle" onClick={toggleTheme}>
              <span className="dot" />
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </div>
            <button className="sidebar-signout" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </aside>
    </>
  )
}

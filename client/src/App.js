import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import supabase from './lib/supabase';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import Dashboard from './pages/Dashboard';
import AnalysisView from './pages/AnalysisView';
import NewAnalysis from './pages/NewAnalysis';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import './styles/global.css';

// Poll /api/health until server responds, with progress callbacks
async function waitForServer(onStatus, signal) {
  const MAX_ATTEMPTS = 24; // 24 × 5s = 120s max
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (signal?.aborted) return false;
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {}
    const remaining = MAX_ATTEMPTS - i - 1;
    onStatus(`Server waking up… (~${remaining * 5}s remaining)`);
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

function AppRouter() {
  const { user, profile, isAdmin, loading, signOut } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
      setIsInviteFlow(true);
    }
  }, []);

  const fetchAnalyses = useCallback(async () => {
    setAnalysesLoading(true);
    setLoadError('');
    setServerStatus('');

    // Cancel any previous wake-up polling
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // First check if server is alive; if not, wait for it
      let serverReady = false;
      try {
        const probe = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
        serverReady = probe.ok;
      } catch {}

      if (!serverReady) {
        setServerStatus('Server waking up…');
        serverReady = await waitForServer(setServerStatus, abort.signal);
      }

      if (abort.signal.aborted) return;

      if (!serverReady) {
        setLoadError('Server did not respond. Please try again.');
        setAnalysesLoading(false);
        return;
      }

      setServerStatus('');
      const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const res = await fetch('/api/analyses', {
        signal: AbortSignal.timeout(30000),
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      if (!abort.signal.aborted) {
        setAnalyses(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error('Failed to fetch analyses:', err);
        setLoadError('Could not load analyses. Click Retry to try again.');
      }
    } finally {
      if (!abort.signal.aborted) {
        setAnalysesLoading(false);
        setServerStatus('');
      }
    }
  }, []);

  useEffect(() => {
    if (user) fetchAnalyses();
    return () => abortRef.current?.abort();
  }, [user, fetchAnalyses]);

  const navigateTo = (p, ticker = null) => {
    setPage(p);
    if (ticker) setSelectedTicker(ticker);
    window.scrollTo(0, 0);
  };

  const onAnalysisComplete = (ticker) => {
    fetchAnalyses();
    navigateTo('analysis', ticker);
  };

  const onUpdate = (analysis) => navigateTo('analysis', analysis.ticker);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0d0f11', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:40, color:'#c9a84c' }}>◈</div>
      <div style={{ color:'#5e5c58', fontSize:14, fontFamily:'DM Sans,sans-serif' }}>Loading ValueSight...</div>
    </div>
  );

  if (isInviteFlow) return <AcceptInvite onComplete={() => setIsInviteFlow(false)} />;

  if (!user) {
    if (showLogin) return <Login onSuccess={() => setShowLogin(false)} onBack={() => setShowLogin(false)} />;
    return <Landing onSignIn={() => setShowLogin(true)} />;
  }

  return (
    <div className="app">
      <Header page={page} onNavigate={navigateTo} isAdmin={isAdmin} profile={profile} onSignOut={signOut} />
      <main className="main-content">
        {page === 'dashboard' && (
          <Dashboard
            analyses={analyses}
            loading={analysesLoading}
            serverStatus={serverStatus}
            loadError={loadError}
            onRetry={fetchAnalyses}
            onSelect={(ticker) => navigateTo('analysis', ticker)}
            onNewAnalysis={() => isAdmin && navigateTo('new')}
            onUpdate={onUpdate}
            isAdmin={isAdmin}
          />
        )}
        {page === 'analysis' && selectedTicker && (
          <AnalysisView
            ticker={selectedTicker}
            onBack={() => navigateTo('dashboard')}
            onAnalysisComplete={onAnalysisComplete}
            isAdmin={isAdmin}
          />
        )}
        {page === 'new' && isAdmin && (
          <NewAnalysis onComplete={onAnalysisComplete} onBack={() => navigateTo('dashboard')} />
        )}
        {page === 'profile' && (
          <Profile onSelectStock={(ticker) => navigateTo('analysis', ticker)} />
        )}
        {page === 'admin' && isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}

function Header({ page, onNavigate, isAdmin, profile, onSignOut }) {
  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';
  const avatarColor = profile?.avatar_color || '#2563eb';

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-brand" onClick={() => onNavigate('dashboard')}>
          <div className="brand-icon">◈</div>
          <div className="brand-text">
            <span className="brand-name">ValueSight</span>
            <span className="brand-sub">Good Stocks Cheap · Marshall Framework</span>
          </div>
        </div>
        <nav className="header-nav">
          <button className={`nav-btn ${page === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>
            Dashboard
          </button>
          {isAdmin && (
            <button className={`nav-btn ${page === 'new' ? 'active' : ''}`} onClick={() => onNavigate('new')}>
              + New Analysis
            </button>
          )}
          {isAdmin && (
            <button className={`nav-btn ${page === 'admin' ? 'active' : ''}`} onClick={() => onNavigate('admin')}>
              Admin
            </button>
          )}
          <button className={`nav-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => onNavigate('profile')}>
            <span style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              width:18, height:18, borderRadius:'50%', background:avatarColor,
              color:'#fff', fontSize:9, fontWeight:700, marginRight:6, flexShrink:0
            }}>{initials}</span>
            Profile
          </button>
          <button className="nav-btn" onClick={onSignOut} style={{ color:'var(--fail)' }}>
            Sign Out
          </button>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

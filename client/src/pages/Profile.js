import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import authFetch from '../lib/api';

const SECTORS = [
  'Technology',
  'Finance & Banking',
  'Pharmaceuticals',
  'FMCG',
  'Automobiles',
  'Energy',
  'Infrastructure',
  'Chemicals',
  'Others',
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Profile({ onSelectStock }) {
  const { user, profile, isAdmin, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editStyle, setEditStyle] = useState('Value Investor');
  const [editRisk, setEditRisk] = useState('Moderate');
  const [editSectors, setEditSectors] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // Watchlist state
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');
  const [removingTicker, setRemovingTicker] = useState(null);

  // Populate edit form from profile
  useEffect(() => {
    if (profile) {
      setEditName(profile.name || '');
      setEditStyle(profile.investment_style || 'Value Investor');
      setEditRisk(profile.risk_appetite || 'Moderate');
      setEditSectors(Array.isArray(profile.preferred_sectors) ? profile.preferred_sectors : []);
    }
  }, [profile]);

  // Load watchlist when tab changes
  const loadWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    setWatchlistError('');
    try {
      const res = await authFetch('/api/watchlist');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setWatchlist(Array.isArray(data) ? data : (data.watchlist || []));
    } catch (err) {
      setWatchlistError(err.message || 'Failed to load watchlist.');
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'watchlist') {
      loadWatchlist();
    }
  }, [activeTab, loadWatchlist]);

  // Profile save
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');

    if (!editName.trim()) {
      setSaveError('Name is required.');
      return;
    }

    setSaveLoading(true);
    try {
      const { error } = await updateProfile({
        name: editName.trim(),
        investment_style: editStyle,
        risk_appetite: editRisk,
        preferred_sectors: editSectors,
      });
      if (error) {
        setSaveError(error.message || 'Failed to save changes.');
      } else {
        setSaveSuccess('Profile updated successfully!');
        setTimeout(() => setSaveSuccess(''), 3000);
      }
    } catch (err) {
      setSaveError('An unexpected error occurred.');
    } finally {
      setSaveLoading(false);
    }
  };

  const toggleSector = (sector) => {
    setEditSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  };

  // Remove from watchlist
  const handleRemove = async (ticker) => {
    setRemovingTicker(ticker);
    try {
      const res = await authFetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }
      setWatchlist((prev) => prev.filter((item) => item.ticker !== ticker));
    } catch (err) {
      setWatchlistError(err.message || 'Failed to remove stock.');
    } finally {
      setRemovingTicker(null);
    }
  };

  const avatarColor = profile?.avatar_color || '#2563eb';
  const displayName = profile?.name || user?.email || 'User';

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>Account</h1>
        </div>

        {/* Avatar & Info */}
        <div style={styles.profileCard}>
          <div style={{ ...styles.avatar, background: avatarColor }}>
            {getInitials(displayName)}
          </div>
          <div style={styles.profileInfo}>
            <div style={styles.profileName}>{displayName}</div>
            <div style={styles.profileEmail}>{user?.email}</div>
            <div style={styles.profileMeta}>
              <span style={styles.metaItem}>
                Joined {formatDate(user?.created_at || profile?.created_at)}
              </span>
              <span style={styles.roleBadge(isAdmin)}>
                {isAdmin ? '⭐ Admin' : 'Member'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {['profile', 'watchlist'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={styles.tabBtn(activeTab === tab)}
            >
              {tab === 'profile' ? '👤 Profile' : '⭐ Watchlist'}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Edit Profile</h2>
            <form onSubmit={handleSave} style={styles.form} noValidate>
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="prof-name">Display Name</label>
                <input
                  id="prof-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={styles.input}
                  placeholder="Your name"
                  disabled={saveLoading}
                />
              </div>

              <div style={styles.row}>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label} htmlFor="prof-style">Investment Style</label>
                  <select
                    id="prof-style"
                    value={editStyle}
                    onChange={(e) => setEditStyle(e.target.value)}
                    style={styles.select}
                    disabled={saveLoading}
                  >
                    <option value="Value Investor">Value Investor</option>
                    <option value="Growth Investor">Growth Investor</option>
                    <option value="Blend">Blend</option>
                  </select>
                </div>
                <div style={{ ...styles.fieldGroup, flex: 1 }}>
                  <label style={styles.label} htmlFor="prof-risk">Risk Appetite</label>
                  <select
                    id="prof-risk"
                    value={editRisk}
                    onChange={(e) => setEditRisk(e.target.value)}
                    style={styles.select}
                    disabled={saveLoading}
                  >
                    <option value="Conservative">Conservative</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Aggressive">Aggressive</option>
                  </select>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Preferred Sectors</label>
                <div style={styles.sectorsGrid}>
                  {SECTORS.map((sector) => {
                    const checked = editSectors.includes(sector);
                    return (
                      <label key={sector} style={styles.sectorLabel(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSector(sector)}
                          disabled={saveLoading}
                          style={{ accentColor: '#f59e0b', cursor: 'pointer' }}
                        />
                        <span>{sector}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {saveError && (
                <div style={styles.errorBox}>⚠ {saveError}</div>
              )}
              {saveSuccess && (
                <div style={styles.successBox}>✓ {saveSuccess}</div>
              )}

              <button
                type="submit"
                style={{
                  ...styles.saveBtn,
                  opacity: saveLoading ? 0.7 : 1,
                  cursor: saveLoading ? 'not-allowed' : 'pointer',
                }}
                disabled={saveLoading}
              >
                {saveLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        )}

        {/* Watchlist Tab */}
        {activeTab === 'watchlist' && (
          <div style={styles.tabContent}>
            <div style={styles.watchlistHeader}>
              <h2 style={styles.sectionTitle}>My Watchlist</h2>
              <button
                onClick={loadWatchlist}
                style={styles.refreshBtn}
                disabled={watchlistLoading}
                title="Refresh watchlist"
              >
                {watchlistLoading ? '…' : '↻ Refresh'}
              </button>
            </div>

            {watchlistError && (
              <div style={styles.errorBox}>⚠ {watchlistError}</div>
            )}

            {watchlistLoading ? (
              <div style={styles.loadingState}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={styles.skeleton} />
                ))}
              </div>
            ) : watchlist.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>⭐</div>
                <div style={styles.emptyTitle}>No stocks in your watchlist yet.</div>
                <div style={styles.emptyDesc}>
                  Bookmark stocks from the dashboard to track them here.
                </div>
              </div>
            ) : (
              <div style={styles.watchlistTable}>
                <div style={styles.tableHeader}>
                  <span style={styles.th}>Ticker</span>
                  <span style={styles.th}>Company</span>
                  <span style={styles.thRight}>Date Added</span>
                  <span style={styles.thRight}>Action</span>
                </div>
                {watchlist.map((item) => (
                  <div key={item.ticker} style={styles.tableRow}>
                    <button
                      style={styles.tickerBtn}
                      onClick={() => onSelectStock && onSelectStock(item.ticker)}
                      title={`View ${item.ticker}`}
                    >
                      {item.ticker}
                    </button>
                    <span style={styles.tdCompany}>
                      {item.company || item.company_name || '—'}
                    </span>
                    <span style={styles.tdDate}>
                      {formatDate(item.added_at || item.created_at)}
                    </span>
                    <button
                      style={{
                        ...styles.removeBtn,
                        opacity: removingTicker === item.ticker ? 0.5 : 1,
                        cursor: removingTicker === item.ticker ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => handleRemove(item.ticker)}
                      disabled={removingTicker === item.ticker}
                      title={`Remove ${item.ticker} from watchlist`}
                    >
                      {removingTicker === item.ticker ? '…' : '✕ Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        input[type="text"]:focus, select:focus {
          outline: none;
          border-color: var(--color-accent, #f59e0b) !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.15) !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg, #0f172a)',
    padding: '32px 16px 60px',
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
  },
  container: {
    maxWidth: '760px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  pageTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: 0,
    fontFamily: 'var(--font-serif, "Libre Baskerville", serif)',
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    background: 'var(--color-surface, #1e293b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  avatar: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 0,
    letterSpacing: '0.5px',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    marginBottom: '3px',
  },
  profileEmail: {
    fontSize: '14px',
    color: 'var(--color-text-muted, #64748b)',
    marginBottom: '8px',
    wordBreak: 'break-all',
  },
  profileMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  metaItem: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #64748b)',
  },
  roleBadge: (isAdmin) => ({
    display: 'inline-block',
    background: isAdmin ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
    color: isAdmin ? '#f59e0b' : '#94a3b8',
    border: `1px solid ${isAdmin ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.3)'}`,
    borderRadius: '100px',
    padding: '2px 10px',
    fontSize: '11.5px',
    fontWeight: '600',
    letterSpacing: '0.3px',
  }),
  tabs: {
    display: 'flex',
    gap: '4px',
    marginBottom: '24px',
    background: 'var(--color-surface, #1e293b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '10px',
    padding: '4px',
  },
  tabBtn: (active) => ({
    flex: 1,
    background: active ? 'var(--color-bg, #0f172a)' : 'transparent',
    color: active ? 'var(--color-text-primary, #f1f5f9)' : 'var(--color-text-muted, #64748b)',
    border: active ? '1px solid var(--color-border, #334155)' : '1px solid transparent',
    borderRadius: '7px',
    padding: '9px 16px',
    fontSize: '13.5px',
    fontWeight: active ? '600' : '400',
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  }),
  tabContent: {
    background: 'var(--color-surface, #1e293b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '12px',
    padding: '28px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: '0 0 20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  row: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-text-secondary, #cbd5e1)',
  },
  input: {
    background: 'var(--color-bg, #0f172a)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '8px',
    padding: '10px 13px',
    fontSize: '14px',
    color: 'var(--color-text-primary, #f1f5f9)',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
  select: {
    background: 'var(--color-bg, #0f172a)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '8px',
    padding: '10px 13px',
    fontSize: '14px',
    color: 'var(--color-text-primary, #f1f5f9)',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 13px center',
    paddingRight: '32px',
  },
  sectorsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '2px',
  },
  sectorLabel: (checked) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 10px',
    background: checked ? 'rgba(245,158,11,0.1)' : 'var(--color-bg, #0f172a)',
    border: `1px solid ${checked ? '#f59e0b' : 'var(--color-border, #334155)'}`,
    borderRadius: '7px',
    cursor: 'pointer',
    fontSize: '12.5px',
    color: checked ? '#f59e0b' : 'var(--color-text-secondary, #cbd5e1)',
    fontWeight: checked ? '600' : '400',
    transition: 'all 0.15s',
    userSelect: 'none',
  }),
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#fca5a5',
  },
  successBox: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#86efac',
  },
  saveBtn: {
    background: 'var(--color-accent, #f59e0b)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 24px',
    fontSize: '14px',
    fontWeight: '700',
    alignSelf: 'flex-start',
    transition: 'opacity 0.2s',
    fontFamily: 'inherit',
  },
  watchlistHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  refreshBtn: {
    background: 'transparent',
    color: 'var(--color-text-muted, #64748b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 0.15s',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '8px',
  },
  skeleton: {
    height: '48px',
    borderRadius: '8px',
    background: 'var(--color-border, #334155)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
  },
  emptyIcon: {
    fontSize: '40px',
    marginBottom: '12px',
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-text-secondary, #cbd5e1)',
    marginBottom: '6px',
  },
  emptyDesc: {
    fontSize: '13.5px',
    color: 'var(--color-text-muted, #64748b)',
    maxWidth: '320px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
  watchlistTable: {
    marginTop: '8px',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 140px 110px',
    gap: '0',
    background: 'rgba(0,0,0,0.2)',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border, #334155)',
  },
  th: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted, #64748b)',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  thRight: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted, #64748b)',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 140px 110px',
    gap: '0',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border, #334155)',
    alignItems: 'center',
    transition: 'background 0.15s',
  },
  tickerBtn: {
    background: 'rgba(37,99,235,0.1)',
    border: '1px solid rgba(37,99,235,0.3)',
    color: '#60a5fa',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.5px',
    transition: 'background 0.15s',
    textAlign: 'left',
    width: 'fit-content',
  },
  tdCompany: {
    fontSize: '13.5px',
    color: 'var(--color-text-secondary, #cbd5e1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingRight: '12px',
  },
  tdDate: {
    fontSize: '12.5px',
    color: 'var(--color-text-muted, #64748b)',
    textAlign: 'right',
  },
  removeBtn: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    color: '#f87171',
    borderRadius: '6px',
    padding: '5px 10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
    textAlign: 'right',
    marginLeft: 'auto',
    display: 'block',
  },
};

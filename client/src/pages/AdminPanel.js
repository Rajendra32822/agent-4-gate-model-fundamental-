import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../lib/api';

const ADMIN_EMAIL = 'rajendra.amil@gmail.com';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getInitials(name, email) {
  const source = name || email || '?';
  return source
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#d97706',
  '#059669', '#0891b2', '#dc2626', '#65a30d',
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function AdminPanel() {
  // Backfill watches
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);

  const handleBackfill = async () => {
    setBackfillLoading(true); setBackfillResult(null);
    try {
      const res = await authFetch('/api/admin/backfill-watches', { method: 'POST' });
      const data = await res.json();
      setBackfillResult(res.ok ? `✓ Done — ${data.created} watches created, ${data.skipped} skipped.` : `⚠ ${data.error}`);
    } catch (e) {
      setBackfillResult('⚠ ' + e.message);
    } finally {
      setBackfillLoading(false);
    }
  };

  // Invite section
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Members section
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError('');
    try {
      const res = await authFetch('/api/admin/users');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : (data.users || []));
    } catch (err) {
      setMembersError(err.message || 'Failed to load members.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Send invite
  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');

    const email = inviteEmail.trim();
    if (!email) {
      setInviteError('Please enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    setInviteLoading(true);
    try {
      const res = await authFetch('/api/admin/invite', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name: inviteName.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || body.message || `Error ${res.status}`);
      }

      setInviteSuccess(`Invite sent to ${email}`);
      setInviteEmail('');
      setInviteName('');
      // Refresh members list after a short delay
      setTimeout(() => loadMembers(), 1500);
    } catch (err) {
      setInviteError(err.message || 'Failed to send invite. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  // Remove member
  const handleRemove = async (member) => {
    const displayName = member.name || member.email;
    const confirmed = window.confirm(
      `Are you sure you want to remove ${displayName} (${member.email})?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setRemovingId(member.id);
    try {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Error ${res.status}`);
      }

      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      setMembersError(err.message || 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Page heading */}
        <div style={styles.pageHeader}>
          <div style={styles.adminBadge}>⭐ Admin Panel</div>
          <h1 style={styles.pageTitle}>User Management</h1>
          <p style={styles.pageSubtitle}>
            Invite new members and manage existing accounts.
          </p>
        </div>

        {/* Backfill Watches */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>◎</div>
            <div>
              <h2 style={styles.cardTitle}>Backfill Entry Zone Watches</h2>
              <p style={styles.cardSubtitle}>
                Run once to create watches for all existing analyses. New analyses auto-create watches going forward.
              </p>
            </div>
          </div>
          <button
            onClick={handleBackfill}
            disabled={backfillLoading}
            style={{ background: '#c9a84c', color: '#0d0f11', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: backfillLoading ? 'not-allowed' : 'pointer', opacity: backfillLoading ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {backfillLoading ? 'Creating watches…' : '↻ Backfill All Watches'}
          </button>
          {backfillResult && <div style={{ marginTop: 12, fontSize: 13, color: backfillResult.startsWith('✓') ? '#22c55e' : '#f87171' }}>{backfillResult}</div>}
        </div>

        {/* Invite Section */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>✉</div>
            <div>
              <h2 style={styles.cardTitle}>Invite New Member</h2>
              <p style={styles.cardSubtitle}>
                Send an invite link to a new user's email address.
              </p>
            </div>
          </div>

          <form onSubmit={handleInvite} style={styles.inviteForm} noValidate>
            <div style={styles.inviteRow}>
              <div style={{ ...styles.fieldGroup, flex: 2 }}>
                <label style={styles.label} htmlFor="invite-email">
                  Email Address <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@example.com"
                  style={styles.input}
                  disabled={inviteLoading}
                  autoComplete="off"
                />
              </div>
              <div style={{ ...styles.fieldGroup, flex: 1 }}>
                <label style={styles.label} htmlFor="invite-name">
                  Name <span style={styles.optionalTag}>(optional)</span>
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Full name"
                  style={styles.input}
                  disabled={inviteLoading}
                  autoComplete="off"
                />
              </div>
            </div>

            {inviteError && (
              <div style={styles.errorBox}>
                <span>⚠</span> {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div style={styles.successBox}>
                <span>✓</span> {inviteSuccess}
              </div>
            )}

            <button
              type="submit"
              style={{
                ...styles.inviteBtn,
                opacity: inviteLoading ? 0.7 : 1,
                cursor: inviteLoading ? 'not-allowed' : 'pointer',
              }}
              disabled={inviteLoading}
            >
              {inviteLoading ? (
                <span style={styles.loadingRow}>
                  <span style={styles.spinner} /> Sending…
                </span>
              ) : (
                '✉ Send Invite'
              )}
            </button>
          </form>
        </div>

        {/* Members Section */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>👥</div>
            <div style={{ flex: 1 }}>
              <h2 style={styles.cardTitle}>
                Members{' '}
                {!membersLoading && (
                  <span style={styles.countBadge}>{members.length}</span>
                )}
              </h2>
              <p style={styles.cardSubtitle}>All registered users on the platform.</p>
            </div>
            <button
              onClick={loadMembers}
              style={styles.refreshBtn}
              disabled={membersLoading}
              title="Refresh member list"
            >
              {membersLoading ? '…' : '↻ Refresh'}
            </button>
          </div>

          {membersError && (
            <div style={{ ...styles.errorBox, margin: '0 0 16px' }}>
              <span>⚠</span> {membersError}
            </div>
          )}

          {membersLoading ? (
            <div style={styles.skeletonList}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={styles.skeletonRow}>
                  <div style={styles.skeletonAvatar} />
                  <div style={styles.skeletonLines}>
                    <div style={{ ...styles.skeletonLine, width: '40%' }} />
                    <div style={{ ...styles.skeletonLine, width: '60%', height: '11px', marginTop: '6px', opacity: 0.5 }} />
                  </div>
                  <div style={{ ...styles.skeletonLine, width: '120px', height: '11px' }} />
                  <div style={{ ...styles.skeletonLine, width: '80px', height: '30px', borderRadius: '6px' }} />
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>👥</div>
              <div style={styles.emptyText}>No members found.</div>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div style={styles.tableHeader}>
                <span style={styles.th} className="col-user">User</span>
                <span style={styles.th} className="col-joined">Joined</span>
                <span style={styles.th} className="col-last">Last Sign In</span>
                <span style={{ ...styles.th, textAlign: 'right' }} className="col-action">Action</span>
              </div>

              {/* Table rows */}
              <div style={styles.tableBody}>
                {members.map((member) => {
                  const isAdmin = member.email === ADMIN_EMAIL;
                  const avatarColor = member.avatar_color || hashColor(member.id || member.email || '');
                  const initials = getInitials(member.name || member.profile?.name, member.email);
                  const displayName = member.name || member.profile?.name || member.email;

                  return (
                    <div key={member.id} style={styles.tableRow(isAdmin)}>
                      {/* Avatar + info */}
                      <div style={styles.userCell}>
                        <div style={{ ...styles.avatar, background: avatarColor }}>
                          {initials}
                        </div>
                        <div style={styles.userInfo}>
                          <div style={styles.userName}>
                            {displayName}
                            {isAdmin && (
                              <span style={styles.adminTag}>Admin</span>
                            )}
                          </div>
                          <div style={styles.userEmail}>{member.email}</div>
                        </div>
                      </div>

                      {/* Joined */}
                      <div style={styles.td}>
                        {formatDate(member.created_at)}
                      </div>

                      {/* Last sign in */}
                      <div style={styles.td}>
                        {formatDateTime(member.last_sign_in_at)}
                      </div>

                      {/* Remove */}
                      <div style={{ ...styles.td, textAlign: 'right' }}>
                        {isAdmin ? (
                          <span style={styles.protectedTag} title="Cannot remove admin account">
                            Protected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRemove(member)}
                            disabled={removingId === member.id}
                            style={{
                              ...styles.removeBtn,
                              opacity: removingId === member.id ? 0.5 : 1,
                              cursor: removingId === member.id ? 'not-allowed' : 'pointer',
                            }}
                            title={`Remove ${displayName}`}
                          >
                            {removingId === member.id ? '…' : '✕ Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        input[type="email"]:focus,
        input[type="text"]:focus {
          outline: none;
          border-color: var(--color-accent, #f59e0b) !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.15) !important;
        }
        .admin-table-row:hover {
          background: rgba(255,255,255,0.03) !important;
        }
        @media (max-width: 700px) {
          .col-last { display: none !important; }
          .invite-row { flex-direction: column !important; }
        }
        @media (max-width: 520px) {
          .col-joined { display: none !important; }
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
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  pageHeader: {
    marginBottom: '4px',
  },
  adminBadge: {
    display: 'inline-block',
    background: 'rgba(245,158,11,0.12)',
    color: '#f59e0b',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: '100px',
    padding: '3px 12px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  pageTitle: {
    fontSize: '30px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: '0 0 6px',
    fontFamily: 'var(--font-serif, "Libre Baskerville", serif)',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--color-text-muted, #64748b)',
    margin: 0,
  },
  card: {
    background: 'var(--color-surface, #1e293b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '14px',
    padding: '28px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
  },
  cardIcon: {
    fontSize: '24px',
    lineHeight: 1,
    marginTop: '2px',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: '0 0 3px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardSubtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted, #64748b)',
    margin: 0,
  },
  countBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-border, #334155)',
    color: 'var(--color-text-secondary, #cbd5e1)',
    borderRadius: '100px',
    padding: '1px 8px',
    fontSize: '12px',
    fontWeight: '700',
  },
  inviteForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  inviteRow: {
    display: 'flex',
    gap: '14px',
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
  optionalTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #64748b)',
    fontWeight: '400',
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
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#fca5a5',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  successBox: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#86efac',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  inviteBtn: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '11px 24px',
    fontSize: '14px',
    fontWeight: '700',
    alignSelf: 'flex-start',
    transition: 'opacity 0.2s, background 0.2s',
    fontFamily: 'inherit',
    letterSpacing: '0.1px',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
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
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  skeletonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  skeletonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '8px 0',
  },
  skeletonAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: 'var(--color-border, #334155)',
    flexShrink: 0,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonLines: {
    flex: 1,
  },
  skeletonLine: {
    height: '14px',
    borderRadius: '4px',
    background: 'var(--color-border, #334155)',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  emptyIcon: {
    fontSize: '36px',
    opacity: 0.3,
    marginBottom: '10px',
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--color-text-muted, #64748b)',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px 180px 100px',
    gap: '0',
    padding: '10px 12px',
    borderRadius: '8px 8px 0 0',
    background: 'rgba(0,0,0,0.15)',
    borderBottom: '1px solid var(--color-border, #334155)',
  },
  th: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--color-text-muted, #64748b)',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
  },
  tableBody: {
    border: '1px solid var(--color-border, #334155)',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px',
    overflow: 'hidden',
  },
  tableRow: (isAdmin) => ({
    display: 'grid',
    gridTemplateColumns: '1fr 120px 180px 100px',
    gap: '0',
    padding: '12px 12px',
    borderBottom: '1px solid var(--color-border, #334155)',
    alignItems: 'center',
    background: isAdmin ? 'rgba(245,158,11,0.03)' : 'transparent',
    transition: 'background 0.15s',
  }),
  userCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
    flexShrink: 0,
    letterSpacing: '0.3px',
  },
  userInfo: {
    minWidth: 0,
  },
  userName: {
    fontSize: '13.5px',
    fontWeight: '600',
    color: 'var(--color-text-primary, #f1f5f9)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  adminTag: {
    fontSize: '10px',
    fontWeight: '700',
    background: 'rgba(245,158,11,0.15)',
    color: '#f59e0b',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: '100px',
    padding: '1px 7px',
    letterSpacing: '0.4px',
    flexShrink: 0,
  },
  userEmail: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #64748b)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  td: {
    fontSize: '12.5px',
    color: 'var(--color-text-muted, #64748b)',
    paddingRight: '8px',
  },
  protectedTag: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #64748b)',
    fontStyle: 'italic',
    cursor: 'default',
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
    whiteSpace: 'nowrap',
  },
};

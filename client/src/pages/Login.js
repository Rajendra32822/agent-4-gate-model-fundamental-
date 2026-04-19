import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login({ onSuccess }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInError } = await signIn(email.trim(), password);
      if (signInError) {
        if (signInError.message?.toLowerCase().includes('invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else if (signInError.message?.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email before signing in.');
        } else {
          setError(signInError.message || 'Sign in failed. Please try again.');
        }
      } else if (data?.user) {
        if (onSuccess) onSuccess(data);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>◈</div>
          <div style={styles.logoText}>ValueSight</div>
          <div style={styles.logoSub}>Good Stocks Cheap · Marshall Framework</div>
        </div>

        {/* Heading */}
        <h1 style={styles.heading}>Welcome back</h1>
        <p style={styles.subheading}>Sign in to your account</p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          {/* Email */}
          <div style={styles.fieldGroup}>
            <label style={styles.label} htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              autoComplete="email"
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div style={styles.fieldGroup}>
            <label style={styles.label} htmlFor="login-password">Password</label>
            <div style={styles.passwordWrapper}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={{ ...styles.input, paddingRight: '48px' }}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.errorBox} role="alert">
              <span style={styles.errorIcon}>⚠</span>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.loadingRow}>
                <span style={styles.spinner} />
                Signing in…
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Invite note */}
        <div style={styles.inviteNote}>
          <span style={styles.lockIcon}>🔒</span>
          This platform is invite-only. Contact admin for access.
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        input:focus {
          outline: none;
          border-color: var(--color-accent, #f59e0b) !important;
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15) !important;
        }
        input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg, #0f172a)',
    padding: '24px 16px',
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
  },
  card: {
    background: 'var(--color-surface, #1e293b)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '16px',
    padding: '40px 36px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  logoIcon: {
    fontSize: '36px',
    color: '#f59e0b',
    lineHeight: 1,
    marginBottom: '6px',
  },
  logoText: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    letterSpacing: '-0.3px',
  },
  logoSub: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #64748b)',
    letterSpacing: '0.4px',
    marginTop: '3px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: '0 0 6px',
    textAlign: 'center',
    fontFamily: 'var(--font-serif, "Libre Baskerville", serif)',
  },
  subheading: {
    fontSize: '14px',
    color: 'var(--color-text-muted, #94a3b8)',
    textAlign: 'center',
    margin: '0 0 28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
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
    letterSpacing: '0.1px',
  },
  input: {
    background: 'var(--color-bg, #0f172a)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '8px',
    padding: '11px 14px',
    fontSize: '14px',
    color: 'var(--color-text-primary, #f1f5f9)',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    fontSize: '16px',
    lineHeight: 1,
    color: 'var(--color-text-muted, #64748b)',
    display: 'flex',
    alignItems: 'center',
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
  errorIcon: {
    flexShrink: 0,
    marginTop: '1px',
  },
  submitBtn: {
    background: 'var(--color-accent, #f59e0b)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '9px',
    padding: '13px',
    fontSize: '15px',
    fontWeight: '700',
    width: '100%',
    transition: 'opacity 0.2s, transform 0.15s',
    fontFamily: 'inherit',
    letterSpacing: '0.2px',
    marginTop: '4px',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(15,23,42,0.3)',
    borderTopColor: '#0f172a',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
  },
  inviteNote: {
    marginTop: '24px',
    padding: '12px 14px',
    background: 'rgba(148,163,184,0.07)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '8px',
    fontSize: '12.5px',
    color: 'var(--color-text-muted, #94a3b8)',
    textAlign: 'center',
    lineHeight: 1.5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  lockIcon: {
    fontSize: '14px',
    flexShrink: 0,
  },
};

import React, { useState } from 'react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

export default function AcceptInvite({ onComplete }) {
  const { updateProfile } = useAuth();

  // Step 1 state
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [step1Loading, setStep1Loading] = useState(false);
  const [step1Error, setStep1Error] = useState('');

  // Step 2 state
  const [name, setName] = useState('');
  const [investmentStyle, setInvestmentStyle] = useState('Value Investor');
  const [riskAppetite, setRiskAppetite] = useState('Moderate');
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState('');

  // Step 1: Set password
  const handleSetPassword = async (e) => {
    e.preventDefault();
    setStep1Error('');

    if (!password) {
      setStep1Error('Please enter a password.');
      return;
    }
    if (password.length < 8) {
      setStep1Error('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setStep1Error('Passwords do not match. Please try again.');
      return;
    }

    setStep1Loading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStep1Error(error.message || 'Failed to set password. Please try again.');
      } else {
        setStep(2);
      }
    } catch (err) {
      setStep1Error('An unexpected error occurred. Please try again.');
    } finally {
      setStep1Loading(false);
    }
  };

  // Step 2: Profile setup
  const toggleSector = (sector) => {
    setSelectedSectors((prev) =>
      prev.includes(sector)
        ? prev.filter((s) => s !== sector)
        : [...prev, sector]
    );
  };

  const handleCompleteProfile = async (e) => {
    e.preventDefault();
    setStep2Error('');

    if (!name.trim()) {
      setStep2Error('Please enter your name.');
      return;
    }

    setStep2Loading(true);
    try {
      const { error } = await updateProfile({
        name: name.trim(),
        investment_style: investmentStyle,
        risk_appetite: riskAppetite,
        preferred_sectors: selectedSectors,
        onboarded: true,
      });

      if (error) {
        setStep2Error(error.message || 'Failed to save profile. Please try again.');
      } else {
        if (onComplete) onComplete();
      }
    } catch (err) {
      setStep2Error('An unexpected error occurred. Please try again.');
    } finally {
      setStep2Loading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>◈</div>
          <div style={styles.logoText}>ValueSight</div>
        </div>

        {/* Step indicator */}
        <div style={styles.stepIndicator}>
          <div style={styles.stepDot(step >= 1)}>
            {step > 1 ? '✓' : '1'}
          </div>
          <div style={styles.stepLine(step >= 2)} />
          <div style={styles.stepDot(step >= 2)}>2</div>
        </div>

        {step === 1 && (
          <>
            <h1 style={styles.heading}>Welcome to ValueSight</h1>
            <p style={styles.subheading}>You've been invited. Set a password to activate your account.</p>

            <form onSubmit={handleSetPassword} style={styles.form} noValidate>
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="new-password">New Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    style={{ ...styles.input, paddingRight: '48px' }}
                    autoComplete="new-password"
                    autoFocus
                    disabled={step1Loading}
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
                <div style={styles.passwordHint}>
                  <div style={styles.strengthBar}>
                    <div
                      style={{
                        ...styles.strengthFill,
                        width: password.length === 0 ? '0%'
                          : password.length < 8 ? '33%'
                          : password.length < 12 ? '66%'
                          : '100%',
                        background: password.length === 0 ? 'transparent'
                          : password.length < 8 ? '#ef4444'
                          : password.length < 12 ? '#f59e0b'
                          : '#22c55e',
                      }}
                    />
                  </div>
                  <span style={styles.hintText}>
                    {password.length === 0 ? '' : password.length < 8 ? 'Too short' : password.length < 12 ? 'Good' : 'Strong'}
                  </span>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="confirm-password">Confirm Password</label>
                <div style={styles.passwordWrapper}>
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    style={{
                      ...styles.input,
                      paddingRight: '48px',
                      borderColor: confirmPassword && password !== confirmPassword
                        ? '#ef4444'
                        : confirmPassword && password === confirmPassword
                        ? '#22c55e'
                        : undefined,
                    }}
                    autoComplete="new-password"
                    disabled={step1Loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    style={styles.eyeBtn}
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <span style={styles.matchError}>Passwords don't match</span>
                )}
                {confirmPassword && password === confirmPassword && (
                  <span style={styles.matchSuccess}>✓ Passwords match</span>
                )}
              </div>

              {step1Error && (
                <div style={styles.errorBox} role="alert">
                  <span>⚠</span> {step1Error}
                </div>
              )}

              <button
                type="submit"
                style={{
                  ...styles.submitBtn,
                  opacity: step1Loading ? 0.7 : 1,
                  cursor: step1Loading ? 'not-allowed' : 'pointer',
                }}
                disabled={step1Loading}
              >
                {step1Loading ? (
                  <span style={styles.loadingRow}>
                    <span style={styles.spinner} /> Setting Password…
                  </span>
                ) : (
                  'Set Password & Continue →'
                )}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={styles.heading}>Set Up Your Profile</h1>
            <p style={styles.subheading}>Tell us about your investment approach to personalise your experience.</p>

            <form onSubmit={handleCompleteProfile} style={styles.form} noValidate>
              {/* Name */}
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="profile-name">Your Name</label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rajendra Amil"
                  style={styles.input}
                  autoFocus
                  disabled={step2Loading}
                />
              </div>

              {/* Investment style */}
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="investment-style">Investment Style</label>
                <select
                  id="investment-style"
                  value={investmentStyle}
                  onChange={(e) => setInvestmentStyle(e.target.value)}
                  style={styles.select}
                  disabled={step2Loading}
                >
                  <option value="Value Investor">Value Investor</option>
                  <option value="Growth Investor">Growth Investor</option>
                  <option value="Blend">Blend</option>
                </select>
              </div>

              {/* Risk appetite */}
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="risk-appetite">Risk Appetite</label>
                <select
                  id="risk-appetite"
                  value={riskAppetite}
                  onChange={(e) => setRiskAppetite(e.target.value)}
                  style={styles.select}
                  disabled={step2Loading}
                >
                  <option value="Conservative">Conservative</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Aggressive">Aggressive</option>
                </select>
              </div>

              {/* Preferred sectors */}
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Preferred Sectors</label>
                <p style={styles.fieldHint}>Select all that interest you (optional)</p>
                <div style={styles.sectorsGrid}>
                  {SECTORS.map((sector) => {
                    const checked = selectedSectors.includes(sector);
                    return (
                      <label key={sector} style={styles.sectorLabel(checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSector(sector)}
                          disabled={step2Loading}
                          style={styles.checkbox}
                        />
                        <span>{sector}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {step2Error && (
                <div style={styles.errorBox} role="alert">
                  <span>⚠</span> {step2Error}
                </div>
              )}

              <button
                type="submit"
                style={{
                  ...styles.submitBtn,
                  opacity: step2Loading ? 0.7 : 1,
                  cursor: step2Loading ? 'not-allowed' : 'pointer',
                }}
                disabled={step2Loading}
              >
                {step2Loading ? (
                  <span style={styles.loadingRow}>
                    <span style={styles.spinner} /> Saving…
                  </span>
                ) : (
                  'Complete Setup →'
                )}
              </button>
            </form>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        input[type="text"]:focus,
        input[type="password"]:focus,
        select:focus {
          outline: none;
          border-color: var(--color-accent, #f59e0b) !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.15) !important;
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
    maxWidth: '480px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  logoIcon: {
    fontSize: '32px',
    color: '#f59e0b',
    lineHeight: 1,
    marginBottom: '4px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    letterSpacing: '-0.3px',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    marginBottom: '28px',
  },
  stepDot: (active) => ({
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: active ? '#f59e0b' : 'var(--color-border, #334155)',
    color: active ? '#0f172a' : 'var(--color-text-muted, #64748b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
    transition: 'background 0.3s',
    flexShrink: 0,
  }),
  stepLine: (active) => ({
    flex: 1,
    height: '2px',
    background: active ? '#f59e0b' : 'var(--color-border, #334155)',
    maxWidth: '80px',
    transition: 'background 0.3s',
  }),
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text-primary, #f1f5f9)',
    margin: '0 0 6px',
    textAlign: 'center',
    fontFamily: 'var(--font-serif, "Libre Baskerville", serif)',
  },
  subheading: {
    fontSize: '13.5px',
    color: 'var(--color-text-muted, #94a3b8)',
    textAlign: 'center',
    margin: '0 0 24px',
    lineHeight: 1.55,
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
  },
  fieldHint: {
    fontSize: '12px',
    color: 'var(--color-text-muted, #64748b)',
    margin: '0',
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
  select: {
    background: 'var(--color-bg, #0f172a)',
    border: '1px solid var(--color-border, #334155)',
    borderRadius: '8px',
    padding: '11px 14px',
    fontSize: '14px',
    color: 'var(--color-text-primary, #f1f5f9)',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: '36px',
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
  passwordHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '4px',
  },
  strengthBar: {
    flex: 1,
    height: '3px',
    background: 'var(--color-border, #334155)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.3s, background 0.3s',
  },
  hintText: {
    fontSize: '11px',
    color: 'var(--color-text-muted, #64748b)',
    minWidth: '50px',
  },
  matchError: {
    fontSize: '12px',
    color: '#fca5a5',
    marginTop: '2px',
  },
  matchSuccess: {
    fontSize: '12px',
    color: '#86efac',
    marginTop: '2px',
  },
  sectorsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginTop: '4px',
  },
  sectorLabel: (checked) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: checked ? 'rgba(245,158,11,0.1)' : 'var(--color-bg, #0f172a)',
    border: `1px solid ${checked ? '#f59e0b' : 'var(--color-border, #334155)'}`,
    borderRadius: '7px',
    cursor: 'pointer',
    fontSize: '13px',
    color: checked ? '#f59e0b' : 'var(--color-text-secondary, #cbd5e1)',
    fontWeight: checked ? '600' : '400',
    transition: 'all 0.15s',
    userSelect: 'none',
  }),
  checkbox: {
    accentColor: '#f59e0b',
    cursor: 'pointer',
    flexShrink: 0,
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
  submitBtn: {
    background: 'var(--color-accent, #f59e0b)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '9px',
    padding: '13px',
    fontSize: '15px',
    fontWeight: '700',
    width: '100%',
    transition: 'opacity 0.2s',
    fontFamily: 'inherit',
    letterSpacing: '0.1px',
    marginTop: '4px',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
  },
  spinner: {
    width: '15px',
    height: '15px',
    border: '2px solid rgba(15,23,42,0.3)',
    borderTopColor: '#0f172a',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
  },
};

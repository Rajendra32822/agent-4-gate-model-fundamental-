import React, { useState, useEffect } from 'react';

const styles = {
  // Reset & base
  root: {
    fontFamily: "'DM Sans', sans-serif",
    color: '#1e293b',
    background: '#ffffff',
    margin: 0,
    padding: 0,
    lineHeight: 1.6,
    overflowX: 'hidden',
  },

  // Navbar
  navbar: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    padding: '0 5%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '68px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  navBrand: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  navLogo: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e3a5f',
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  navSub: {
    fontSize: '11px',
    color: '#64748b',
    letterSpacing: '0.5px',
    fontWeight: '500',
  },
  navSignInBtn: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 22px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontFamily: "'DM Sans', sans-serif",
  },

  // Hero
  hero: {
    background: '#f8fafc',
    padding: '80px 5% 90px',
    display: 'flex',
    alignItems: 'center',
    gap: '48px',
    minHeight: '560px',
  },
  heroLeft: {
    flex: '0 0 55%',
    maxWidth: '55%',
  },
  heroBadge: {
    display: 'inline-block',
    background: '#eff6ff',
    color: '#2563eb',
    border: '1px solid #bfdbfe',
    borderRadius: '100px',
    padding: '5px 14px',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.4px',
    marginBottom: '20px',
  },
  heroH1: {
    fontFamily: "'Libre Baskerville', Georgia, serif",
    fontSize: '48px',
    fontWeight: '700',
    color: '#1e3a5f',
    lineHeight: 1.18,
    margin: '0 0 20px',
    letterSpacing: '-0.5px',
  },
  heroSubtitle: {
    fontSize: '17px',
    color: '#475569',
    lineHeight: 1.7,
    margin: '0 0 32px',
    maxWidth: '520px',
  },
  heroCtas: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  ctaPrimary: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '9px',
    padding: '13px 28px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.1px',
  },
  ctaSecondary: {
    background: 'transparent',
    color: '#1e3a5f',
    border: '2px solid #1e3a5f',
    borderRadius: '9px',
    padding: '11px 26px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.1px',
  },
  heroRight: {
    flex: '0 0 45%',
    maxWidth: '45%',
    display: 'flex',
    justifyContent: 'flex-end',
  },

  // Mock card
  mockCard: {
    background: '#0f172a',
    borderRadius: '16px',
    padding: '28px',
    width: '100%',
    maxWidth: '360px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    border: '1px solid #1e293b',
  },
  mockHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  mockIcon: {
    fontSize: '22px',
    color: '#f59e0b',
  },
  mockTicker: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: '0.5px',
  },
  mockBadge: {
    background: '#16a34a',
    color: '#ffffff',
    borderRadius: '6px',
    padding: '3px 10px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    marginLeft: 'auto',
  },
  mockEntry: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#f1f5f9',
    fontFamily: "'Libre Baskerville', serif",
    marginBottom: '6px',
  },
  mockEntryLabel: {
    fontSize: '12px',
    color: '#64748b',
    letterSpacing: '0.5px',
    marginBottom: '22px',
    textTransform: 'uppercase',
  },
  mockGatesLabel: {
    fontSize: '11px',
    color: '#475569',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    marginBottom: '12px',
    fontWeight: '600',
  },
  mockGates: {
    display: 'flex',
    gap: '8px',
    marginBottom: '22px',
  },
  mockGateDot: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
  },
  mockDivider: {
    height: '1px',
    background: '#1e293b',
    margin: '0 0 16px',
  },
  mockFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mockFooterLabel: {
    fontSize: '12px',
    color: '#475569',
  },
  mockScore: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#22c55e',
  },

  // Stats bar
  statsBar: {
    background: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    padding: '22px 5%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 32px',
  },
  statDivider: {
    width: '1px',
    height: '28px',
    background: '#e2e8f0',
  },
  statDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2563eb',
    flexShrink: 0,
  },
  statText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
    letterSpacing: '0.1px',
  },

  // Features
  features: {
    background: '#ffffff',
    padding: '80px 5%',
  },
  sectionLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: '10px',
  },
  sectionTitle: {
    fontFamily: "'Libre Baskerville', Georgia, serif",
    fontSize: '34px',
    fontWeight: '700',
    color: '#1e3a5f',
    textAlign: 'center',
    margin: '0 0 48px',
    letterSpacing: '-0.3px',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
  },
  featureCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '28px 24px',
    transition: 'box-shadow 0.2s, transform 0.2s',
  },
  featureIcon: {
    fontSize: '28px',
    marginBottom: '14px',
    display: 'block',
    color: '#2563eb',
  },
  featureTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: '8px',
  },
  featureDesc: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: 1.65,
    margin: 0,
  },

  // How It Works
  howItWorks: {
    background: '#f8fafc',
    padding: '80px 5%',
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '28px',
    marginTop: '48px',
  },
  stepCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '32px 28px',
    position: 'relative',
  },
  stepNumber: {
    width: '44px',
    height: '44px',
    background: '#1e3a5f',
    color: '#ffffff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '700',
    marginBottom: '18px',
    fontFamily: "'Libre Baskerville', serif",
  },
  stepTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: '10px',
  },
  stepDesc: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: 1.65,
    margin: 0,
  },

  // Quote
  quoteSection: {
    background: '#1e3a5f',
    padding: '72px 5%',
    textAlign: 'center',
  },
  quoteIcon: {
    fontSize: '48px',
    color: '#f59e0b',
    opacity: 0.7,
    marginBottom: '20px',
    fontFamily: 'Georgia, serif',
    lineHeight: 1,
  },
  quoteText: {
    fontFamily: "'Libre Baskerville', Georgia, serif",
    fontSize: '26px',
    fontWeight: '400',
    fontStyle: 'italic',
    color: '#f1f5f9',
    maxWidth: '680px',
    margin: '0 auto 20px',
    lineHeight: 1.55,
    letterSpacing: '-0.2px',
  },
  quoteAuthor: {
    fontSize: '14px',
    color: '#94a3b8',
    fontWeight: '600',
    letterSpacing: '0.5px',
  },

  // Footer
  footer: {
    background: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    padding: '28px 5%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  footerText: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#94a3b8',
  },
};

const gateColors = [
  { bg: '#14532d', color: '#86efac' },
  { bg: '#14532d', color: '#86efac' },
  { bg: '#14532d', color: '#86efac' },
  { bg: '#14532d', color: '#86efac' },
  { bg: '#14532d', color: '#86efac' },
];

const gateLabels = ['G1', 'G2', 'G3', 'G4', 'G5'];

export default function Landing({ onSignIn }) {
  const [navHover, setNavHover] = useState(false);
  const [primaryHover, setPrimaryHover] = useState(false);
  const [secondaryHover, setSecondaryHover] = useState(false);

  const scrollToHow = () => {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={styles.root}>
      {/* Responsive style injection */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        @media (max-width: 900px) {
          .hero-inner { flex-direction: column !important; }
          .hero-left { flex: unset !important; max-width: 100% !important; }
          .hero-right { flex: unset !important; max-width: 100% !important; justify-content: flex-start !important; }
          .hero-h1 { font-size: 34px !important; }
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .stats-bar { flex-wrap: wrap !important; gap: 10px !important; }
          .stat-divider { display: none !important; }
        }
        @media (max-width: 600px) {
          .hero-inner { padding: 48px 5% 56px !important; }
          .hero-h1 { font-size: 28px !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .section-title { font-size: 26px !important; }
          .quote-text { font-size: 20px !important; }
          .nav-sub { display: none !important; }
          .footer-inner { flex-direction: column !important; align-items: flex-start !important; }
          .mock-card { max-width: 100% !important; }
        }
      `}</style>

      {/* Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.navBrand}>
          <span style={styles.navLogo}>◈ ValueSight</span>
          <span style={styles.navSub} className="nav-sub">Good Stocks Cheap · Marshall Framework</span>
        </div>
        <button
          style={{
            ...styles.navSignInBtn,
            background: navHover ? '#1d4ed8' : '#2563eb',
          }}
          onMouseEnter={() => setNavHover(true)}
          onMouseLeave={() => setNavHover(false)}
          onClick={onSignIn}
        >
          Sign In
        </button>
      </nav>

      {/* Hero */}
      <section
        style={{ ...styles.hero }}
        className="hero-inner"
      >
        <div style={styles.heroLeft} className="hero-left">
          <span style={styles.heroBadge}>Invite-Only · Indian Equity Research</span>
          <h1 style={styles.heroH1} className="hero-h1">
            Institutional-Grade Fundamental Research, Powered by AI
          </h1>
          <p style={styles.heroSubtitle}>
            ValueSight applies Kenneth Jeffrey Marshall's rigorous 4-gate framework
            to Indian equities — helping serious investors find great businesses
            at prices that protect capital and compound wealth over time.
          </p>
          <div style={styles.heroCtas}>
            <button
              style={{
                ...styles.ctaPrimary,
                background: primaryHover ? '#1d4ed8' : '#2563eb',
                transform: primaryHover ? 'translateY(-1px)' : 'none',
              }}
              onMouseEnter={() => setPrimaryHover(true)}
              onMouseLeave={() => setPrimaryHover(false)}
              onClick={onSignIn}
            >
              Sign In →
            </button>
            <button
              style={{
                ...styles.ctaSecondary,
                background: secondaryHover ? '#f1f5f9' : 'transparent',
              }}
              onMouseEnter={() => setSecondaryHover(true)}
              onMouseLeave={() => setSecondaryHover(false)}
              onClick={scrollToHow}
            >
              How It Works ↓
            </button>
          </div>
        </div>

        <div style={styles.heroRight} className="hero-right">
          <div style={styles.mockCard} className="mock-card">
            <div style={styles.mockHeader}>
              <span style={styles.mockIcon}>◈</span>
              <span style={styles.mockTicker}>NATCOPHARM</span>
              <span style={styles.mockBadge}>BUY</span>
            </div>
            <div style={styles.mockEntry}>₹850</div>
            <div style={styles.mockEntryLabel}>Entry Zone</div>
            <div style={styles.mockGatesLabel}>Gates Passed</div>
            <div style={styles.mockGates}>
              {gateLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.mockGateDot,
                    background: gateColors[i].bg,
                    color: gateColors[i].color,
                    border: `1px solid ${gateColors[i].color}33`,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div style={styles.mockDivider} />
            <div style={styles.mockFooter}>
              <span style={styles.mockFooterLabel}>Marshall Score</span>
              <span style={styles.mockScore}>5 / 5 Gates ✓</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <div style={styles.statsBar} className="stats-bar">
        {[
          '5 Gates Checked',
          'AI-Powered',
          'NSE/BSE Coverage',
          'Invite-Only Access',
        ].map((stat, i) => (
          <React.Fragment key={stat}>
            {i > 0 && <div style={styles.statDivider} className="stat-divider" />}
            <div style={styles.statItem}>
              <div style={styles.statDot} />
              <span style={styles.statText}>{stat}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Features */}
      <section style={styles.features}>
        <div style={styles.sectionLabel}>Why ValueSight</div>
        <h2 style={styles.sectionTitle} className="section-title">
          Research Built on Discipline
        </h2>
        <div style={styles.featuresGrid} className="features-grid">
          {[
            {
              icon: '▣',
              title: '4-Gate Framework',
              desc: "Marshall's four sequential gates ensure only the most disciplined investments pass — business quality, management integrity, financial strength, and price.",
            },
            {
              icon: '◈',
              title: 'AI-Powered Research',
              desc: 'Claude AI synthesizes annual reports, earnings calls, and financial data to evaluate each gate — saving you weeks of manual research.',
            },
            {
              icon: '⚑',
              title: 'India-Specific Rules',
              desc: 'Adjusted for Indian accounting standards, promoter structures, regulatory nuances, and NSE/BSE-listed companies across all market caps.',
            },
            {
              icon: '↻',
              title: 'Quarterly Updates',
              desc: 'Gate scores are refreshed each quarter as new financial data arrives — so your research stays current with each earnings cycle.',
            },
          ].map((f) => (
            <div key={f.title} style={styles.featureCard}>
              <span style={styles.featureIcon}>{f.icon}</span>
              <div style={styles.featureTitle}>{f.title}</div>
              <p style={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section style={styles.howItWorks} id="how-it-works">
        <div style={styles.sectionLabel}>Getting Started</div>
        <h2 style={styles.sectionTitle} className="section-title">
          How It Works
        </h2>
        <div style={styles.stepsGrid} className="steps-grid">
          {[
            {
              num: '1',
              title: 'Get Invited',
              desc: "ValueSight is invite-only. Contact the admin at rajendra.amil@gmail.com to request access. You'll receive an email with your invitation link.",
            },
            {
              num: '2',
              title: 'Set Your Profile',
              desc: 'After accepting your invite, set your investment style, risk appetite, and preferred sectors. This helps tailor the research experience to your strategy.',
            },
            {
              num: '3',
              title: 'Start Researching',
              desc: "Search any NSE/BSE-listed stock, run the AI through Marshall's 4-gate evaluation, and build your watchlist of conviction positions.",
            },
          ].map((step) => (
            <div key={step.num} style={styles.stepCard}>
              <div style={styles.stepNumber}>{step.num}</div>
              <div style={styles.stepTitle}>{step.title}</div>
              <p style={styles.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section style={styles.quoteSection}>
        <div style={styles.quoteIcon}>"</div>
        <p style={styles.quoteText} className="quote-text">
          You don't need to be brilliant. You need to be disciplined.
        </p>
        <p style={styles.quoteAuthor}>— Kenneth Jeffrey Marshall</p>
      </section>

      {/* Footer */}
      <footer style={styles.footer} className="footer-inner">
        <p style={styles.footerText}>
          © 2025 ValueSight · Built for serious Indian equity investors
        </p>
        <div style={styles.footerRight}>
          <span>Powered by</span>
          <span style={{ color: '#2563eb', fontWeight: '600' }}>Claude AI</span>
        </div>
      </footer>
    </div>
  );
}

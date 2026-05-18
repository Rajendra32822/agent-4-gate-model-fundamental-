import React, { useState } from 'react';
import HoldingsTable from '../components/portfolio/HoldingsTable';
import TransactionsList from '../components/portfolio/TransactionsList';
import FrameworkPerformance from '../components/portfolio/FrameworkPerformance';

const TABS = [
  { key: 'holdings',    label: 'Holdings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'performance',  label: 'Framework Performance' },
];

export default function Portfolio({ onSelectStock }) {
  const [tab, setTab] = useState(localStorage.getItem('portfolioTab') || 'holdings');
  const setTabPersisted = (k) => { setTab(k); localStorage.setItem('portfolioTab', k); };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Portfolio</div>
        <div className="page-subtitle">Real positions · Framework performance backtest</div>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTabPersisted(t.key)}
            style={{
              padding: '10px 16px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
              color: tab === t.key ? 'var(--text)' : 'var(--text-3)',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 500, cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'holdings'     && <HoldingsTable onSelectStock={onSelectStock} />}
      {tab === 'transactions' && <TransactionsList />}
      {tab === 'performance'  && <FrameworkPerformance onSelectStock={onSelectStock} />}
    </div>
  );
}

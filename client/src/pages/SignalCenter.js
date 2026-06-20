import React, { useState, useEffect, useCallback } from 'react';
import authFetch from '../lib/api';
import { exportZerodhaKite, exportAngelOne, calculateQuantity } from '../utils/basketExporter';

const fmtVal = (n) => {
  if (n == null || !isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const STRATEGY_LABELS = {
  marshall_undervalued: 'Marshall Undervalued',
  quality_compounders: 'Quality Compounders',
  deep_value: 'Deep Value',
  high_growth: 'High Growth'
};

export default function SignalCenter({ onSelectStock }) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('active'); // 'active' (PENDING) or 'history' (EXECUTED, DISMISSED)
  const [searchQuery, setSearchQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [allocation, setAllocation] = useState(100000);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/trade-signals');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setSignals(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const handleStatusUpdate = async (id, status) => {
    try {
      const res = await authFetch(`/api/trade-signals/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update signal status');
      
      // Update local state
      setSignals(prev => prev.map(sig => sig.id === id ? { ...sig, status } : sig));
      
      // Remove from selection if it changes status
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      alert(e.message);
    }
  };

  const handleBulkStatusUpdate = async (status) => {
    if (selectedIds.size === 0) return;
    const idsToUpdate = Array.from(selectedIds);
    let failedCount = 0;

    for (const id of idsToUpdate) {
      try {
        const res = await authFetch(`/api/trade-signals/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (!res.ok) failedCount++;
      } catch {
        failedCount++;
      }
    }

    if (failedCount > 0) {
      alert(`Updated status, but failed for ${failedCount} signals`);
    }
    
    // Refresh signals from backend to be absolutely in sync
    fetchSignals();
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (filteredSignals) => {
    if (selectedIds.size === filteredSignals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSignals.map(s => s.id)));
    }
  };

  const handleExportKite = (filteredSignals) => {
    const selectedSignals = filteredSignals.filter(s => selectedIds.has(s.id));
    if (selectedSignals.length === 0) {
      alert('Please select at least one signal to export.');
      return;
    }
    exportZerodhaKite(selectedSignals, allocation);
  };

  const handleExportAngel = (filteredSignals) => {
    const selectedSignals = filteredSignals.filter(s => selectedIds.has(s.id));
    if (selectedSignals.length === 0) {
      alert('Please select at least one signal to export.');
      return;
    }
    exportAngelOne(selectedSignals, allocation);
  };

  // Filter and Search logic
  const filtered = signals.filter(sig => {
    // 1. Tab status filter
    const statusMatch = activeTab === 'active' ? sig.status === 'PENDING' : sig.status !== 'PENDING';
    if (!statusMatch) return false;

    // 2. Strategy filter
    if (strategyFilter !== 'ALL' && sig.strategy_key !== strategyFilter) return false;

    // 3. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const tickerMatch = sig.ticker.toLowerCase().includes(q);
      const companyMatch = sig.company?.toLowerCase().includes(q);
      if (!tickerMatch && !companyMatch) return false;
    }

    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Signal Center</div>
        <div className="page-subtitle">Actionable buy/sell triggers combining high-conviction fundamentals with momentum technical filters.</div>
      </div>

      {/* Overview Metric Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card card-sm" style={{ background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Pending Signals</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
            {signals.filter(s => s.status === 'PENDING').length}
          </div>
        </div>
        <div className="card card-sm" style={{ background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Executed Signals</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--pass)' }}>
            {signals.filter(s => s.status === 'EXECUTED').length}
          </div>
        </div>
        <div className="card card-sm" style={{ background: 'var(--surface)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Dismissed Signals</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-2)' }}>
            {signals.filter(s => s.status === 'DISMISSED').length}
          </div>
        </div>
      </div>

      {/* Tabs & Setup bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <button 
            onClick={() => { setActiveTab('active'); setSelectedIds(new Set()); }}
            style={{
              background: 'transparent', border: 'none', color: activeTab === 'active' ? 'var(--accent)' : 'var(--text-2)',
              fontWeight: 600, fontSize: 16, cursor: 'pointer', borderBottom: activeTab === 'active' ? '2px solid var(--accent)' : 'none',
              paddingBottom: 8
            }}
          >
            Active Suggestions ({signals.filter(s => s.status === 'PENDING').length})
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setSelectedIds(new Set()); }}
            style={{
              background: 'transparent', border: 'none', color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-2)',
              fontWeight: 600, fontSize: 16, cursor: 'pointer', borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : 'none',
              paddingBottom: 8
            }}
          >
            Signal History ({signals.filter(s => s.status !== 'PENDING').length})
          </button>
        </div>

        {/* Capital Allocation Setup */}
        {activeTab === 'active' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Capital per trade:</span>
            <input 
              type="number" 
              value={allocation}
              onChange={(e) => setAllocation(Number(e.target.value))}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                borderRadius: 4, padding: '4px 8px', width: 110, fontSize: 13, fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
        )}
      </div>

      {/* Filters Area */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input 
          type="text"
          placeholder="Search by Ticker or Company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field"
          style={{ flex: '1 1 240px', padding: '8px 12px', fontSize: 14 }}
        />
        <select 
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
          className="input-field"
          style={{ width: 220, padding: '8px 12px', fontSize: 14 }}
        >
          <option value="ALL">All Strategies</option>
          <option value="marshall_undervalued">Marshall Undervalued</option>
          <option value="quality_compounders">Quality Compounders</option>
          <option value="deep_value">Deep Value</option>
          <option value="high_growth">High Growth</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={fetchSignals} style={{ display: 'flex', alignItems: 'center' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Bulk Actions */}
      {activeTab === 'active' && selectedIds.size > 0 && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <strong>{selectedIds.size}</strong> signals selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => handleExportKite(filtered)}>
              📥 Export Kite CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => handleExportAngel(filtered)} style={{ background: '#3b82f6', color: '#fff' }}>
              📥 Export Angel CSV
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleBulkStatusUpdate('EXECUTED')} style={{ borderColor: 'var(--pass)', color: 'var(--pass)' }}>
              ✓ Mark Executed
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleBulkStatusUpdate('DISMISSED')} style={{ borderColor: 'var(--fail)', color: 'var(--fail)' }}>
              ✕ Mark Dismissed
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: 'var(--text-3)', padding: 40, textAlign: 'center' }}>Loading signals...</div>}
      {error && <div style={{ color: 'var(--fail)', padding: 40, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, color: 'var(--text-3)', marginBottom: 12 }}>◌</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>No Signals Found</div>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {activeTab === 'active' ? 'No pending triggers currently active.' : 'No historical signals logged.'}
          </div>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {activeTab === 'active' && (
                  <th style={{ padding: '10px 14px', width: 40, borderBottom: '1px solid var(--border)' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.size === filtered.length}
                      onChange={() => toggleSelectAll(filtered)}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Ticker / Company</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Strategy</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', width: 90 }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Price</th>
                {activeTab === 'active' && (
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Target Qty</th>
                )}
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', width: 100 }}>Date</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Reasons / Description</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', width: 140 }}>Status / Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sig => {
                const isSelected = selectedIds.has(sig.id);
                const targetQty = calculateQuantity(sig.price, allocation);
                return (
                  <tr 
                    key={sig.id} 
                    style={{ 
                      borderBottom: '1px solid var(--border)', 
                      background: isSelected ? 'rgba(201, 168, 76, 0.04)' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    {activeTab === 'active' && (
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(sig.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                    )}
                    <td 
                      style={{ padding: '10px 14px', cursor: 'pointer' }}
                      onClick={() => onSelectStock?.(sig.ticker)}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{sig.ticker}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{sig.company}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                      {STRATEGY_LABELS[sig.strategy_key] || sig.strategy_key}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className={`verdict-badge verdict-${sig.signal_type}`}>
                        {sig.signal_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {fmtVal(sig.price)}
                    </td>
                    {activeTab === 'active' && (
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                        {targetQty} shares
                      </td>
                    )}
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-3)' }}>
                      {sig.date}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: 12, maxWidth: 300, lineHeight: 1.4 }}>
                      {sig.reasons?.description || 'Triggered by momentum indicators'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {sig.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '3px 8px', fontSize: 11, borderColor: 'var(--pass-border)', color: 'var(--pass)' }}
                            onClick={() => handleStatusUpdate(sig.id, 'EXECUTED')}
                          >
                            ✓ Exec
                          </button>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ padding: '3px 8px', fontSize: 11, borderColor: 'var(--fail-border)', color: 'var(--fail)' }}
                            onClick={() => handleStatusUpdate(sig.id, 'DISMISSED')}
                          >
                            ✕ Dismiss
                          </button>
                        </div>
                      ) : (
                        <span 
                          style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                            color: sig.status === 'EXECUTED' ? 'var(--pass)' : 'var(--text-3)'
                          }}
                        >
                          {sig.status}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

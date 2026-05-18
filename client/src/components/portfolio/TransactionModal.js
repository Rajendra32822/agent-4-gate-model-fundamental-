import React, { useState, useEffect } from 'react';
import authFetch from '../../lib/api';

const TITLES = {
  BUY:      'Add Buy',
  SELL:     'Add Sell',
  DIVIDEND: 'Add Dividend',
  SPLIT:    'Add Split / Bonus',
};

export default function TransactionModal({ type, onClose, onSaved }) {
  const [ticker, setTicker]   = useState('');
  const [company, setCompany] = useState('');
  const [quantity, setQty]    = useState('');
  const [price, setPrice]     = useState('');
  const [amount, setAmount]   = useState('');
  const [ratio, setRatio]     = useState('');
  const [splitType, setSplitType] = useState('SPLIT');
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    authFetch('/api/analyses').then(r => r.ok ? r.json() : []).then(setSuggestions).catch(() => {});
  }, []);

  const onTickerChange = (v) => {
    setTicker(v.toUpperCase());
    const m = suggestions.find(s => s.ticker?.toUpperCase() === v.toUpperCase());
    if (m) setCompany(m.company || '');
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const realType = (type === 'SPLIT') ? splitType : type;
    const body = {
      ticker, company, type: realType, transaction_date: date, notes,
      quantity: quantity ? Number(quantity) : null,
      price:    price    ? Number(price)    : null,
      amount:   amount   ? Number(amount)   : null,
      ratio:    ratio || null,
    };
    try {
      const res = await authFetch('/api/portfolio/transactions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Save failed');
      onSaved?.(j);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 24px', width: '100%', maxWidth: 440,
      }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginBottom: 16 }}>{TITLES[type] || 'Add Transaction'}</div>

        <Field label="Ticker">
          <input list="ticker-options" value={ticker} onChange={e => onTickerChange(e.target.value)} required className="input-field" placeholder="HDFCBANK" autoFocus />
          <datalist id="ticker-options">
            {suggestions.map(s => <option key={s.ticker} value={s.ticker}>{s.company}</option>)}
          </datalist>
        </Field>

        {(type === 'BUY' || type === 'SELL') && (
          <>
            <Field label="Quantity">
              <input type="number" step="any" value={quantity} onChange={e => setQty(e.target.value)} required className="input-field" />
            </Field>
            <Field label="Price per share (₹)">
              <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} required className="input-field" />
            </Field>
          </>
        )}

        {type === 'DIVIDEND' && (
          <>
            <Field label="Total amount received (₹)">
              <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} required className="input-field" />
            </Field>
            <Field label="Per-share amount (₹, optional)">
              <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} className="input-field" placeholder="auto-computed if blank" />
            </Field>
          </>
        )}

        {type === 'SPLIT' && (
          <>
            <Field label="Type">
              <div style={{ display: 'flex', gap: 12 }}>
                <label><input type="radio" name="st" value="SPLIT" checked={splitType === 'SPLIT'} onChange={e => setSplitType(e.target.value)} /> Split</label>
                <label><input type="radio" name="st" value="BONUS" checked={splitType === 'BONUS'} onChange={e => setSplitType(e.target.value)} /> Bonus</label>
              </div>
            </Field>
            <Field label="Ratio (e.g. 1:5 for split, 1:1 for bonus)">
              <input value={ratio} onChange={e => setRatio(e.target.value)} required className="input-field" placeholder="1:5" />
            </Field>
          </>
        )}

        <Field label="Date">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="input-field" />
        </Field>

        <Field label="Notes (optional)">
          <input value={notes} onChange={e => setNotes(e.target.value)} className="input-field" />
        </Field>

        {error && <div style={{ color: 'var(--fail)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

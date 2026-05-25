const { test } = require('node:test');
const assert = require('node:assert');
const { parseCorporateActionFromText, validateConfirm, resolveChain, TICKER_KEYED_TABLES } = require('../corporateActions');

test('parse: none/na/empty → null', () => {
  assert.equal(parseCorporateActionFromText('None found'), null);
  assert.equal(parseCorporateActionFromText('No corporate actions in the last 3 years'), null);
  assert.equal(parseCorporateActionFromText('N/A'), null);
  assert.equal(parseCorporateActionFromText(''), null);
  assert.equal(parseCorporateActionFromText(null), null);
});

test('parse: split/bonus with ratio', () => {
  assert.deepEqual(parseCorporateActionFromText('1:5 stock split, ex-date Mar 2024'), { event_type: 'SPLIT', ratio: '1:5' });
  assert.deepEqual(parseCorporateActionFromText('Bonus issue 1:1 announced'), { event_type: 'BONUS', ratio: '1:1' });
});

test('parse: demerger before merger; name/ticker changes', () => {
  assert.equal(parseCorporateActionFromText('Company underwent a demerger').event_type, 'DEMERGER');
  assert.equal(parseCorporateActionFromText('Merger with XYZ completed').event_type, 'MERGER');
  assert.equal(parseCorporateActionFromText('The company was renamed to ABC Ltd').event_type, 'NAME_CHANGE');
  assert.equal(parseCorporateActionFromText('Buyback of shares at ₹500').event_type, 'BUYBACK');
});

test('parse: unrecognized → null', () => {
  assert.equal(parseCorporateActionFromText('Strong quarterly results, no special items'), null);
});

test('validateConfirm enforces required fields per type', () => {
  assert.equal(validateConfirm({ event_type: 'TICKER_CHANGE' }).ok, false);
  assert.equal(validateConfirm({ event_type: 'TICKER_CHANGE', new_ticker: 'NEW' }).ok, true);
  assert.equal(validateConfirm({ event_type: 'NAME_CHANGE' }).ok, false);
  assert.equal(validateConfirm({ event_type: 'NAME_CHANGE', new_name: 'New Co' }).ok, true);
  assert.equal(validateConfirm({ event_type: 'SPLIT' }).ok, true);
});

test('resolveChain follows old→new and guards cycles', () => {
  assert.equal(resolveChain([], 'TCS'), 'TCS');
  assert.equal(resolveChain([{ old_ticker: 'OLD', new_ticker: 'NEW' }], 'OLD'), 'NEW');
  assert.equal(resolveChain([{ old_ticker: 'A', new_ticker: 'B' }, { old_ticker: 'B', new_ticker: 'C' }], 'A'), 'C');
  assert.equal(resolveChain([{ old_ticker: 'X', new_ticker: 'Y' }], 'Z'), 'Z');
  const cyc = resolveChain([{ old_ticker: 'A', new_ticker: 'B' }, { old_ticker: 'B', new_ticker: 'A' }], 'A');
  assert.ok(cyc === 'A' || cyc === 'B');
});

test('TICKER_KEYED_TABLES covers the critical user/analysis tables', () => {
  for (const t of ['analyses', 'portfolio_transactions', 'watchlist', 'company_ratios', 'corporate_actions']) {
    assert.ok(TICKER_KEYED_TABLES.includes(t), `missing ${t}`);
  }
});

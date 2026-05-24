const { test } = require('node:test');
const assert = require('node:assert');
const { parsePriceNumber, parseEntryZoneMidpoint, checkValuationConsistency } = require('../agent');

test('parsePriceNumber strips ₹/commas and reads the first number', () => {
  assert.equal(parsePriceNumber('₹7,500'), 7500);
  assert.equal(parsePriceNumber('₹681'), 681);
  assert.equal(parsePriceNumber('2,317.9'), 2317.9);
  assert.equal(parsePriceNumber('N/A — not found in search data'), null);
  assert.equal(parsePriceNumber(null), null);
  assert.equal(parsePriceNumber(''), null);
});

test('parseEntryZoneMidpoint averages a range, or reads a single value', () => {
  assert.equal(parseEntryZoneMidpoint('₹7,500–8,500'), 8000);   // en-dash
  assert.equal(parseEntryZoneMidpoint('₹7,500-8,500'), 8000);   // hyphen
  assert.equal(parseEntryZoneMidpoint('₹500'), 500);
  assert.equal(parseEntryZoneMidpoint(null), null);
});

test('ACE case: scenarios far above current price are flagged unreliable', () => {
  // current ₹681, base/entry ~₹8,000 → ~12× → unreliable
  const r = checkValuationConsistency(681, [9000, 8000]);
  assert.equal(r.reliable, false);
  assert.match(r.reason, /current price/i);
});

test('normal case: scenarios near current price are reliable', () => {
  assert.equal(checkValuationConsistency(681, [620, 700, 850]).reliable, true);
});

test('no current price → cannot judge, treated as reliable (do not falsely flag)', () => {
  assert.equal(checkValuationConsistency(null, [9000, 8000]).reliable, true);
  assert.equal(checkValuationConsistency(0, [9000]).reliable, true);
});

test('threshold: >3x is unreliable, within 3x is reliable', () => {
  assert.equal(checkValuationConsistency(1000, [3500]).reliable, false); // 3.5x
  assert.equal(checkValuationConsistency(1000, [2500]).reliable, true);  // 2.5x
  assert.equal(checkValuationConsistency(1000, [300]).reliable, false);  // 0.3x (< 0.33)
  assert.equal(checkValuationConsistency(1000, [400]).reliable, true);   // 0.4x
});

test('ignores null/invalid candidate prices', () => {
  assert.equal(checkValuationConsistency(681, [null, NaN, 700]).reliable, true);
  assert.equal(checkValuationConsistency(681, []).reliable, true);
});

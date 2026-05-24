const { test } = require('node:test');
const assert = require('node:assert');
const { matchCompanyInUniverse } = require('../agent');

const UNIVERSE = [
  { ticker: 'TCS', company_name: 'Tata Consultancy Services', sector: 'IT' },
  { ticker: 'HDFCBANK', company_name: 'HDFC Bank', sector: 'Banking' },
  { ticker: 'TATASTEEL', company_name: 'Tata Steel', sector: 'Metals' },
  { ticker: 'INFY', company_name: 'Infosys', sector: 'IT' },
];

test('exact ticker match (case-insensitive) wins', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'tcs').ticker, 'TCS');
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'INFY').ticker, 'INFY');
});

test('exact company name match', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'Infosys').ticker, 'INFY');
});

test('name startsWith beats name includes', () => {
  // "tata" starts Tata Consultancy and Tata Steel; first startsWith in list order wins
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'Tata').ticker, 'TCS');
});

test('name substring match', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'consultancy').ticker, 'TCS');
});

test('ticker startsWith match', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'HDFC').ticker, 'HDFCBANK');
});

test('no match returns null', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, 'Reliance'), null);
});

test('empty/blank query returns null', () => {
  assert.equal(matchCompanyInUniverse(UNIVERSE, ''), null);
  assert.equal(matchCompanyInUniverse(UNIVERSE, '   '), null);
  assert.equal(matchCompanyInUniverse(UNIVERSE, undefined), null);
});

test('handles empty/invalid universe', () => {
  assert.equal(matchCompanyInUniverse([], 'TCS'), null);
  assert.equal(matchCompanyInUniverse(null, 'TCS'), null);
});

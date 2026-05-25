const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScreenerHtml, normalizePeriod } = require('../ingestion/screenerScraper');

const FIXTURE_HTML = `
<html><body>
<section id="quarters">
  <table class="data-table">
    <thead><tr><th></th>
      <th>Mar 2024</th><th>Jun 2024</th><th>Sep 2024</th><th>Dec 2024</th><th>Mar 2025</th>
    </tr></thead>
    <tbody>
      <tr><td>Sales +</td><td>37,923</td><td>39,315</td><td>40,986</td><td>41,764</td><td>40,925</td></tr>
      <tr><td>Expenses +</td><td>29,139</td><td>29,878</td><td>31,177</td><td>31,649</td><td>31,051</td></tr>
      <tr><td>Operating Profit</td><td>8,784</td><td>9,437</td><td>9,809</td><td>10,115</td><td>9,874</td></tr>
      <tr><td>OPM %</td><td>23%</td><td>24%</td><td>24%</td><td>24%</td><td>24%</td></tr>
      <tr><td>Other Income +</td><td>2,729</td><td>838</td><td>712</td><td>859</td><td>1,190</td></tr>
      <tr><td>Interest</td><td>110</td><td>105</td><td>108</td><td>101</td><td>102</td></tr>
      <tr><td>Depreciation</td><td>1,163</td><td>1,149</td><td>1,160</td><td>1,203</td><td>1,299</td></tr>
      <tr><td>Profit before tax</td><td>10,240</td><td>9,021</td><td>9,253</td><td>9,670</td><td>9,663</td></tr>
      <tr><td>Tax %</td><td>22%</td><td>29%</td><td>30%</td><td>29%</td><td>27%</td></tr>
      <tr><td>Net Profit +</td><td>7,975</td><td>6,374</td><td>6,516</td><td>6,822</td><td>7,038</td></tr>
      <tr><td>EPS in Rs</td><td>19.20</td><td>15.34</td><td>15.67</td><td>16.39</td><td>16.93</td></tr>
    </tbody>
  </table>
</section>

<section id="profit-loss">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Sales +</td><td>100,000</td><td>120,000</td><td>140,000</td><td>160,000</td></tr>
      <tr><td>Expenses +</td><td>75,000</td><td>90,000</td><td>105,000</td><td>118,000</td></tr>
      <tr><td>Operating Profit</td><td>25,000</td><td>30,000</td><td>35,000</td><td>42,000</td></tr>
      <tr><td>OPM %</td><td>25%</td><td>25%</td><td>25%</td><td>26%</td></tr>
      <tr><td>Net Profit +</td><td>15,000</td><td>18,000</td><td>22,000</td><td>26,000</td></tr>
      <tr><td>EPS in Rs</td><td>30.00</td><td>36.00</td><td>44.00</td><td>52.00</td></tr>
    </tbody>
  </table>
</section>

<section id="balance-sheet">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Equity Capital</td><td>500</td><td>500</td><td>500</td><td>500</td></tr>
      <tr><td>Reserves</td><td>40,000</td><td>50,000</td><td>62,000</td><td>76,000</td></tr>
      <tr><td>Borrowings +</td><td>15,000</td><td>13,000</td><td>11,000</td><td>9,000</td></tr>
      <tr><td>Total Liabilities</td><td>70,000</td><td>78,000</td><td>87,000</td><td>96,000</td></tr>
      <tr><td>Fixed Assets +</td><td>30,000</td><td>33,000</td><td>36,000</td><td>40,000</td></tr>
      <tr><td>Total Assets</td><td>70,000</td><td>78,000</td><td>87,000</td><td>96,000</td></tr>
    </tbody>
  </table>
</section>

<section id="cash-flow">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2022</th><th>Mar 2023</th><th>Mar 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Cash from Operating Activity +</td><td>20,000</td><td>23,000</td><td>27,000</td><td>32,000</td></tr>
      <tr><td>Cash from Investing Activity +</td><td>-8,000</td><td>-9,000</td><td>-10,000</td><td>-11,000</td></tr>
      <tr><td>Cash from Financing Activity +</td><td>-5,000</td><td>-6,000</td><td>-7,000</td><td>-8,000</td></tr>
      <tr><td>Net Cash Flow</td><td>7,000</td><td>8,000</td><td>10,000</td><td>13,000</td></tr>
    </tbody>
  </table>
</section>
</body></html>
`;

test('normalizePeriod: annual fiscal year', () => {
  assert.deepEqual(normalizePeriod('Mar 2024'), { date: '2024-03-31', label: 'FY24', kind: 'annual' });
  assert.deepEqual(normalizePeriod('Mar 2026'), { date: '2026-03-31', label: 'FY26', kind: 'annual' });
});

test('normalizePeriod: quarter ends', () => {
  assert.deepEqual(normalizePeriod('Jun 2024'), { date: '2024-06-30', label: 'Q1FY25', kind: 'quarter' });
  assert.deepEqual(normalizePeriod('Sep 2024'), { date: '2024-09-30', label: 'Q2FY25', kind: 'quarter' });
  assert.deepEqual(normalizePeriod('Dec 2024'), { date: '2024-12-31', label: 'Q3FY25', kind: 'quarter' });
});

test('parseScreenerHtml: extracts quarterly P&L', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.ok(Array.isArray(result.quarterly_pl));
  assert.equal(result.quarterly_pl.length, 5);
  const mar25 = result.quarterly_pl.find(r => r.q_end === '2025-03-31');
  assert.equal(mar25.sales_cr, 40925);
  assert.equal(mar25.net_profit_cr, 7038);
  assert.equal(mar25.opm_pct, 24);
  assert.equal(mar25.eps_rs, 16.93);
});

test('parseScreenerHtml: extracts annual P&L', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.ok(Array.isArray(result.annual_pl));
  assert.equal(result.annual_pl.length, 4);
  const fy25 = result.annual_pl.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.sales_cr, 160000);
  assert.equal(fy25.net_profit_cr, 26000);
  assert.equal(fy25.eps_rs, 52);
});

test('parseScreenerHtml: extracts annual BS (equity computed)', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.equal(result.annual_bs.length, 4);
  const fy25 = result.annual_bs.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.equity_share_capital_cr, 500);
  assert.equal(fy25.reserves_cr, 76000);
  assert.equal(fy25.total_equity_cr, 76500);
  assert.equal(fy25.total_debt_cr, 9000);
  assert.equal(fy25.total_assets_cr, 96000);
});

test('parseScreenerHtml: extracts annual CF', () => {
  const result = parseScreenerHtml('TEST', FIXTURE_HTML);
  assert.equal(result.annual_cf.length, 4);
  const fy25 = result.annual_cf.find(r => r.fy_end === '2025-03-31');
  assert.equal(fy25.ocf_cr, 32000);
  assert.equal(fy25.icf_cr, -11000);
  assert.equal(fy25.ffc_cr, -8000);
  assert.equal(fy25.net_change_cash_cr, 13000);
});

test('parseScreenerHtml: empty/garbage HTML returns empty arrays', () => {
  const result = parseScreenerHtml('TEST', '<html><body><h1>not screener</h1></body></html>');
  assert.deepEqual(result.quarterly_pl, []);
  assert.deepEqual(result.annual_pl, []);
});

const { parseResultDate } = require('../ingestion/screenerScraper');

const RATIOS_HTML = `<html><body>
<ul id="top-ratios">
  <li><span class="name">Current Price</span><span class="value">3,500</span></li>
  <li><span class="name">Result date</span><span class="value">30 Jun 2027</span></li>
</ul>
</body></html>`;

test('parseResultDate: month-year only → first of month', () => {
  assert.equal(parseResultDate('Jun 2027'), '2027-06-01');
});

test('parseResultDate: day-month-year → exact date', () => {
  assert.equal(parseResultDate('30 Jun 2027'), '2027-06-30');
});

test('parseResultDate: stale date (>5 days past) → null', () => {
  assert.equal(parseResultDate('01 Jan 2020'), null);
});

test('parseResultDate: null → null', () => {
  assert.equal(parseResultDate(null), null);
});

test('parseResultDate: N/A → null', () => {
  assert.equal(parseResultDate('N/A'), null);
});

test('parseScreenerHtml: extracts result date from top-ratios section', () => {
  const result = parseScreenerHtml('TEST', RATIOS_HTML);
  assert.equal(result.ratios.resultDate, '2027-06-30');
});

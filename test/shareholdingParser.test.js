const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScreenerHtml } = require('../ingestion/screenerScraper');

const HTML = `
<html><body>
<section id="shareholding">
  <table class="data-table">
    <thead><tr><th></th><th>Mar 2024</th><th>Jun 2024</th><th>Sep 2024</th><th>Dec 2024</th><th>Mar 2025</th></tr></thead>
    <tbody>
      <tr><td>Promoters +</td><td>40.12</td><td>40.10</td><td>39.80</td><td>39.50</td><td>39.20</td></tr>
      <tr><td>FIIs +</td><td>18.50</td><td>19.00</td><td>20.10</td><td>21.00</td><td>22.30</td></tr>
      <tr><td>DIIs +</td><td>15.20</td><td>15.40</td><td>15.10</td><td>14.90</td><td>14.50</td></tr>
      <tr><td>Government +</td><td>0.10</td><td>0.10</td><td>0.10</td><td>0.10</td><td>0.10</td></tr>
      <tr><td>Public +</td><td>26.08</td><td>25.40</td><td>24.90</td><td>24.50</td><td>23.90</td></tr>
      <tr><td>No. of Shareholders</td><td>1,20,000</td><td>1,25,000</td><td>1,30,000</td><td>1,35,000</td><td>1,40,000</td></tr>
      <tr><td>Pledged percentage</td><td>5.00</td><td>4.50</td><td>3.00</td><td>2.00</td><td>1.50</td></tr>
    </tbody>
  </table>
</section>
</body></html>
`;

test('parseScreenerHtml: extracts shareholding', () => {
  const r = parseScreenerHtml('TEST', HTML);
  assert.ok(Array.isArray(r.shareholding));
  assert.equal(r.shareholding.length, 5);
  const mar25 = r.shareholding.find(s => s.period_end === '2025-03-31');
  assert.equal(mar25.promoter_pct, 39.2);
  assert.equal(mar25.fii_pct, 22.3);
  assert.equal(mar25.dii_pct, 14.5);
  assert.equal(mar25.government_pct, 0.1);
  assert.equal(mar25.public_pct, 23.9);
  assert.equal(mar25.pledge_pct, 1.5);
  assert.equal(mar25.shareholders, 140000);
});

test('parseScreenerHtml: shareholding period labels are calendar dates', () => {
  const r = parseScreenerHtml('TEST', HTML);
  const jun24 = r.shareholding.find(s => s.period_end === '2024-06-30');
  assert.equal(jun24.period_label, 'Jun 2024');
  assert.equal(jun24.promoter_pct, 40.1);
});

test('parseScreenerHtml: missing pledge row leaves pledge null', () => {
  const noPledge = HTML.replace(/<tr><td>Pledged percentage<\/td>.*?<\/tr>/s, '');
  const r = parseScreenerHtml('TEST', noPledge);
  const mar25 = r.shareholding.find(s => s.period_end === '2025-03-31');
  assert.equal(mar25.pledge_pct, null);
  assert.equal(mar25.promoter_pct, 39.2);
});

test('parseScreenerHtml: no shareholding section returns empty array', () => {
  const r = parseScreenerHtml('TEST', '<html><body></body></html>');
  assert.deepEqual(r.shareholding, []);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchYahooDailyPrices } = require('../priceCheck');

function makeChartJson(timestamps, opens, highs, lows, closes, volumes, adjcloses) {
  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: {
          quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }],
          adjclose: [{ adjclose: adjcloses }],
        },
      }],
    },
  };
}

test('fetchYahooDailyPrices: parses OHLCV + adj_close from Yahoo response', async () => {
  const mockHttp = async () => ({
    status: 200,
    json: makeChartJson(
      [1609459200, 1609545600],
      [100, 102], [105, 107], [99, 101], [103, 106],
      [1000000, 900000], [102.5, 105.8]
    ),
  });
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2021-01-01');
  assert.equal(rows[0].open, 100);
  assert.equal(rows[0].high, 105);
  assert.equal(rows[0].low, 99);
  assert.equal(rows[0].close, 103);
  assert.equal(rows[0].adjClose, 102.5);
  assert.equal(rows[0].volume, 1000000);
});

test('fetchYahooDailyPrices: filters out rows where close is null', async () => {
  const mockHttp = async () => ({
    status: 200,
    json: makeChartJson(
      [1609459200, 1609545600],
      [100, 102], [105, 107], [99, 101], [103, null],
      [1000000, 900000], [102.5, null]
    ),
  });
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].close, 103);
});

test('fetchYahooDailyPrices: falls back from .NS to .BO when first call throws', async () => {
  let callCount = 0;
  const mockHttp = async () => {
    callCount++;
    if (callCount === 1) throw new Error('NS blocked');
    return {
      status: 200,
      json: makeChartJson([1609459200], [100], [105], [99], [103], [1000000], [102.5]),
    };
  };
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.equal(rows.length, 1);
  assert.equal(callCount, 2);
});

test('fetchYahooDailyPrices: returns [] when both exchanges fail', async () => {
  const mockHttp = async () => { throw new Error('blocked'); };
  const rows = await fetchYahooDailyPrices('TCS', 730, mockHttp);
  assert.deepEqual(rows, []);
});

test('fetchYahooDailyPrices: maps rangeDays to Yahoo range param correctly', async () => {
  const urls = [];
  const mockHttp = async (url) => {
    urls.push(url);
    return { status: 200, json: makeChartJson([1609459200], [100], [105], [99], [103], [1000000], [102.5]) };
  };
  await fetchYahooDailyPrices('TCS', 365, mockHttp);
  await fetchYahooDailyPrices('TCS', 730, mockHttp);
  await fetchYahooDailyPrices('TCS', 1800, mockHttp);
  assert.ok(urls[0].includes('range=1y'), `expected range=1y in ${urls[0]}`);
  assert.ok(urls[1].includes('range=2y'), `expected range=2y in ${urls[1]}`);
  assert.ok(urls[2].includes('range=5y'), `expected range=5y in ${urls[2]}`);
});

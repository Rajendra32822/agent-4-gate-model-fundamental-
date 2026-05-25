const { fetchYahooDailyPrices } = require('../priceCheck');

const dailyPricesState = {
  running:    false,
  total:      0,
  done:       0,
  failed:     0,
  skipped:    0,
  current:    null,
  startedAt:  null,
  finishedAt: null,
};

function getDailyPricesState() {
  return { ...dailyPricesState };
}

/**
 * Maps the last known price date to a Yahoo fetch window.
 * null/undefined → 730  (full 2-year backfill)
 * date < today   → 7   (incremental — covers weekends/gaps)
 * date = today   → 0   (skip — already up to date)
 */
function rangeDaysFor(lastDate) {
  if (!lastDate) return 730;
  const last  = new Date(lastDate);
  const today = new Date();
  last.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (last >= today) return 0;
  return 7;
}

module.exports = { rangeDaysFor, getDailyPricesState };

const { fetchYahooCorporateActions } = require('../priceCheck');

const corporateActionsProposalState = {
  running:    false,
  total:      0,
  done:       0,
  failed:     0,
  skipped:    0,
  current:    null,
  startedAt:  null,
  finishedAt: null,
};

function getCorporateActionsProposalState() {
  return { ...corporateActionsProposalState };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Fetches splits + dividends from Yahoo for each ticker and proposes new ones
 * into the corporate_actions queue (status = 'proposed').
 * Deduplicates on (ticker, event_type, ex_date) — skips if already exists.
 *
 * @param {string[]} tickers
 * @param {object}   db      { corporateActionExists, createCorporateAction }
 * @param {object}   opts    { throttleMs=1500, fetchFn=fetchYahooCorporateActions }
 */
async function runCorporateActionsProposal(tickers, db, opts = {}) {
  const throttleMs = opts.throttleMs ?? 1500;
  const fetchFn    = opts.fetchFn    || fetchYahooCorporateActions;

  corporateActionsProposalState.running    = true;
  corporateActionsProposalState.total      = tickers.length;
  corporateActionsProposalState.done       = 0;
  corporateActionsProposalState.failed     = 0;
  corporateActionsProposalState.skipped    = 0;
  corporateActionsProposalState.startedAt  = new Date().toISOString();
  corporateActionsProposalState.finishedAt = null;

  for (const ticker of tickers) {
    corporateActionsProposalState.current = ticker;
    try {
      const { splits, dividends } = await fetchFn(ticker, 365);
      const candidates = [
        ...splits.map(s => ({ event_type: 'SPLIT',    ex_date: s.date, ratio:  s.ratio,  source: 'yahoo' })),
        ...dividends.map(d => ({ event_type: 'DIVIDEND', ex_date: d.date, amount: d.amount, source: 'yahoo' })),
      ];
      for (const c of candidates) {
        const exists = await db.corporateActionExists(ticker, c.event_type, c.ex_date);
        if (!exists) {
          await db.createCorporateAction({ ticker, ...c, status: 'proposed' });
        }
      }
      corporateActionsProposalState.done++;
    } catch (err) {
      console.error(`[corpActions] ${ticker}: ${err.message}`);
      corporateActionsProposalState.failed++;
    }
    await sleep(throttleMs);
  }

  corporateActionsProposalState.running    = false;
  corporateActionsProposalState.finishedAt = new Date().toISOString();

  return {
    total:   corporateActionsProposalState.total,
    done:    corporateActionsProposalState.done,
    failed:  corporateActionsProposalState.failed,
    skipped: corporateActionsProposalState.skipped,
  };
}

module.exports = { runCorporateActionsProposal, getCorporateActionsProposalState };

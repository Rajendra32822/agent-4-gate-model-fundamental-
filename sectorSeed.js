/**
 * Phase 7 sector microtheory seed — per-NSE-industry Marshall quality benchmarks.
 * Pure data, no deps. Loaded into the `sectors` table by db.seedSectors().
 * primary_metric = which return metric is the quality gate for the sector.
 * roce_benchmark is null where ROCE doesn't apply (financials/asset-heavy).
 */
const SECTOR_SEED = [
  { sector: 'Information Technology',          primary_metric: 'roce', roce_benchmark: 30, roe_benchmark: 20, notes: 'asset-light, high returns' },
  { sector: 'Fast Moving Consumer Goods',      primary_metric: 'roce', roce_benchmark: 25, roe_benchmark: 20, notes: 'brand moats' },
  { sector: 'Consumer Durables',               primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'brands + mfg' },
  { sector: 'Healthcare',                      primary_metric: 'roce', roce_benchmark: 20, roe_benchmark: 18, notes: 'pharma/hospitals' },
  { sector: 'Consumer Services',               primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'retail/QSR/hospitality' },
  { sector: 'Services',                        primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 18, notes: 'asset-light' },
  { sector: 'Chemicals',                       primary_metric: 'roce', roce_benchmark: 18, roe_benchmark: 16, notes: 'specialty/commodity mix' },
  { sector: 'Capital Goods',                   primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'manufacturing baseline' },
  { sector: 'Automobile and Auto Components',  primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'capital-intensive mfg' },
  { sector: 'Construction Materials',          primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'cement etc.' },
  { sector: 'Media Entertainment & Publication', primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: '' },
  { sector: 'Diversified',                     primary_metric: 'roce', roce_benchmark: 15, roe_benchmark: 15, notes: 'default' },
  { sector: 'Textiles',                        primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'low-margin mfg' },
  { sector: 'Metals & Mining',                 primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'cyclical commodity' },
  { sector: 'Oil Gas & Consumable Fuels',      primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'capital-heavy, cyclical' },
  { sector: 'Power',                           primary_metric: 'roce', roce_benchmark: 12, roe_benchmark: 12, notes: 'regulated, capital-heavy' },
  { sector: 'Telecommunication',               primary_metric: 'roce', roce_benchmark: 10, roe_benchmark: 10, notes: 'very capital-intensive' },
  { sector: 'Financial Services',              primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 15, notes: 'banks/NBFCs — ROCE N/A' },
  { sector: 'Construction',                    primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 15, notes: 'EPC, asset/WC-heavy' },
  { sector: 'Realty',                          primary_metric: 'roe',  roce_benchmark: null, roe_benchmark: 12, notes: 'lumpy, asset-heavy' },
];

module.exports = { SECTOR_SEED };

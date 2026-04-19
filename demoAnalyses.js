/**
 * Pre-loaded analyses from the Good Stocks Cheap session
 * These are immediately available in the dashboard without an API call
 */

const DEMO_ANALYSES = {
  "APARINDS": {
    "ticker": "APARINDS",
    "company": "Apar Industries Limited",
    "analysisDate": "2026-04-13",
    "overallVerdict": "WATCH",
    "verdictSummary": "Apar Industries is an exceptional business — world's #1 conductor manufacturer, ROCE averaging 35%, zero promoter pledge, and structural tailwinds from India T&D expansion and global energy transition. However at ₹11,180 the stock trades at EV/OI of ~22× and P/B of 9.3×, well above Marshall's value thresholds. The business deserves a premium; it just doesn't deserve a value investor's premium at these prices.",
    "targetEntryPrice": "₹4,500–5,700 (EV/OI 10–12× on forward operating income)",
    "gate1": {
      "verdict": "PASS",
      "understandingStatement": "Apar Industries is a Hyderabad-based global B2B manufacturer of power transmission conductors (world's largest), transformer & specialty oils (global #4), and power/telecom cables, serving utilities, railways, and industrial customers across 140+ countries with ~45% revenues from exports.",
      "parameters": {
        "products": "Industrial B2B manufactured goods — conductors (48%), transformer & specialty oils (24%), power/telecom cables (23%), lubricants (5%)",
        "customers": "Global power utilities, EPC contractors, railways, industrial customers. PGCIL, Kalpataru, KEC, Adani Power domestically; US/European/Middle East utilities for exports.",
        "industry": "Electrical infrastructure manufacturing — transmission conductors and specialty petroleum products",
        "form": "Standalone manufacturer with 4 overseas subsidiaries (Singapore, USA, UAE). No complex holding structures.",
        "geography": "Headquartered in Mumbai. Manufacturing in India. Exports to 140+ countries (~45% revenue). No single export market dominates.",
        "status": "World's largest conductor manufacturer; global #4 transformer oil producer. Mid-cap on Nifty Midcap 150."
      },
      "indiaFlags": ["EOU status for India plants provides duty benefits", "QIP in FY24 at ₹5,254/share was above book — shareholder-accretive"],
      "narrative": "Apar passes Gate 1 with ease. The business is simple to understand — a B2B manufacturer of critical electrical infrastructure components. The 65-year operating history under the Desai family provides credibility. Post the demerger of lubricants, the remaining three segments are all structurally aligned with global electrification. The recent ₹157 Cr Kavach railway contract signals diversification into railway signalling — a new domestic growth vector."
    },
    "gate2a": {
      "verdict": "PASS",
      "metrics": {
        "roce5yr": {"value": "35%", "benchmark": "≥15%", "status": "PASS"},
        "roeLast": {"value": "20%", "benchmark": "≥15%", "status": "PASS"},
        "revenueCAGR5yr": {"value": "30%", "benchmark": "≥8%", "status": "PASS"},
        "patCAGR5yr": {"value": "43%", "benchmark": "≥8%", "status": "PASS"},
        "debtEquity": {"value": "0.14×", "benchmark": "≤1.5×", "status": "PASS"},
        "promoterPledge": {"value": "0%", "benchmark": "0%", "status": "PASS"},
        "ocfQuality": {"value": "94%", "benchmark": "≥80%", "status": "PASS"}
      },
      "indiaFlags": ["FY24 negative OCF (−₹283 Cr) was a working capital surge during revenue ramp — not a fundamental concern", "Debt is entirely working capital borrowing — no long-term debt stress"],
      "narrative": "Apar's historical performance is exceptional. ROCE averaged 35% over the last 5 years, peaking at 51% in FY23 during the aluminium price surge and US export boom. Revenue tripled from ₹6,388 Cr (FY21) to ₹18,581 Cr (FY25). PAT CAGR of 43% over 5 years is best-in-class for Indian manufacturing. D/E of 0.14× is effectively debt-free. ICRA/CARE AA/Stable rating confirmed post-QIP. The only concern is working capital intensity — debtor days at 80 and inventory at 82 days create OCF swings, but the 3-year average OCF is healthy. The FY25 normalisation of ROCE to 33% from the 51% peak is actually reassuring — it confirms the business was not permanently re-rated upward by a one-time cycle."
    },
    "gate2b": {
      "verdict": "PASS",
      "breadthAnalysis": {
        "customerBreadth": "PASS",
        "supplierBreadth": "PASS",
        "customerBreadthNote": "No single customer >10% of revenue. Domestic base spans 5+ independent utilities and EPC players. Exports to 140+ countries.",
        "supplierBreadthNote": "Aluminium from Hindalco, Vedanta, NALCO — multiple domestic sources. Crude-based base oils from refineries — import risk present but managed. No China dependency."
      },
      "forcesAnalysis": {
        "customerBargainingPower": "WEAK",
        "supplierBargainingPower": "WEAK",
        "threatSubstitutes": "LOW",
        "threatNewEntrants": "MODERATE",
        "overallForces": "FAVOURABLE"
      },
      "moat": {
        "exists": true,
        "type": "COST",
        "description": "World's largest conductor manufacturer with scale-driven cost efficiencies. Supplemented by ingrainedness — pre-qualified by PGCIL and global utilities, re-qualification of a new vendor takes 18–24 months. Exclusive India licence for CTC Global's ACCC conductor technology and ENI partnership for specialty oils add technology moat layer.",
        "durabilityRating": "MODERATE"
      },
      "marketGrowth": {
        "rating": "STRONG",
        "description": "India's ₹2.5 lakh Cr T&D capex plan (FY24–30), US grid modernisation ($65B from IIJA), Middle East renewables, and global energy transition all drive multi-year conductor and cable demand. Structural tailwinds are 7–10 year in duration."
      },
      "indiaFlags": ["Chinese competition (ZTT, Hengtong) in commodity conductors is the primary moat risk for export segment"],
      "narrative": "Apar's competitive position is strong but not impregnable. The moat is real — scale, pre-qualification ingrainedness, and the CTC Global ACCC licence — but it's not a consumer brand moat. Chinese manufacturers compete aggressively at the commodity end. Apar's premiumisation strategy (HTLS, ACCC, copper products) partially insulates it. The market growth case is the strongest of any company in this series — global energy transition capex is a 10-year structural trend directly benefiting Apar's core products."
    },
    "gate2c": {
      "verdict": "PASS",
      "indicators": {
        "promoterHolding": {"value": "57.77%", "trend": "STABLE", "status": "PASS"},
        "promoterPledge": {"value": "0%", "status": "PASS"},
        "dividendPayout": {"value": "25%", "status": "PASS"},
        "rptConcerns": {"value": "MINOR", "status": "PASS"},
        "auditQuality": {"value": "B S R & Co LLP (KPMG affiliate), no qualified opinion", "status": "PASS"}
      },
      "indiaFlags": ["RPTs exist but within SEBI approval norms — no large-scale cash drainage detected", "CEO Cable Solutions resigned Dec 2025 — worth monitoring"],
      "narrative": "Apar scores well on shareholder-friendliness. Desai family holds 57.77% with zero pledge — eliminating forced-selling risk entirely. The FY24 QIP at ₹5,264/share (well above book) was dilutive but capital-accretive. Consistent 22–27% dividend payout for 10+ years. ICRA/CARE AA/Stable rating reaffirmed post-QIP. The minor RPT concerns are disclosed and within norms."
    },
    "gate3": {
      "verdict": "EXPENSIVE",
      "metrics": {
        "currentPrice": "₹11,180",
        "marketCap": "₹39,400 Cr",
        "evOI": {"value": "~22×", "benchmark": "≤7× strict / ≤12× India", "status": "FAIL"},
        "mcapFCF": {"value": "~67×", "benchmark": "≤15×", "status": "FAIL"},
        "priceBook": {"value": "9.3×", "benchmark": "≤3×", "status": "FAIL"},
        "peRatio": {"value": "~45×", "status": "INFO"},
        "netCash": {"value": "Minimal — debt is working capital", "status": "INFO"},
        "dividendYield": {"value": "0.53%", "status": "INFO"}
      },
      "valuationScenarios": {
        "bearCase": {"price": "₹3,100", "assumption": "EV/OI 7× on FY26E OI — Marshall strict limit"},
        "baseCase": {"price": "₹5,000", "assumption": "EV/OI 12× on FY26E OI — India-adjusted fair value"},
        "bullCase": {"price": "₹5,700", "assumption": "EV/OI 14× on FY27E OI with growth premium"}
      },
      "entryZone": "₹4,500–5,700",
      "indiaFlags": ["Stock has done 11× from 2021 to 2026 — market has already priced in 7 years of the energy transition cycle"],
      "narrative": "Apar decisively fails Gate 3. At ₹11,180, EV/OI is ~22×, P/B is 9.3×, and MCAP/FCF is ~67×. The 52-week low of ₹4,740 in early 2025 was briefly in the value zone (EV/OI ~11–12×). At current prices, even an India-adjusted premium for quality does not justify the valuation. The market is pricing in 5–7 more years of the energy transition capex cycle at peak margins. A patient value investor waits for ₹4,500–5,700."
    },
    "keyRisks": [
      "Chinese conductor manufacturers (ZTT, Hengtong) competing on price in export markets — eroding commodity conductor margins",
      "Aluminium price spike would inflate working capital and compress OCF — seen in FY24",
      "Revenue concentration in US exports (~40% of export revenue) — subject to tariff/trade policy risk",
      "Normalisation of ROCE from the FY23 peak — already happening, may compress further"
    ],
    "catalysts": [
      "India T&D capex acceleration under National Electricity Plan FY24–32",
      "US Inflation Reduction Act grid modernisation spend ($65B over 5 years)",
      "Railway Kavach expansion — new domestic revenue vector",
      "Premiumisation to ACCC and HTLS conductors improving export mix margins"
    ],
    "comparablePeers": ["POLYCAB", "KEI", "STERLITEPOWER"],
    "dataQualityNote": "Analysis based on FY25 annual report and Q3FY26 quarterly data. Working capital analysis requires standalone financials for precision — consolidated figures used throughout."
  },

  "ABB": {
    "ticker": "ABB",
    "company": "ABB India Limited",
    "analysisDate": "2026-04-13",
    "overallVerdict": "WATCH",
    "verdictSummary": "ABB India is an exceptional business — debt-free, ROCE of 28–39%, 76-year operating history, and a genuine brand+switching-cost moat in industrial electrification. But at ₹6,050 with P/E of ~77× and P/B of ~18×, EV/OI is ~62×. The parent's 75% holding (SEBI maximum) means minority shareholders don't control the agenda — royalty charges and business divestitures are driven by ABB Switzerland. Post-Robotics-divestment business is leaner. Value entry: ₹900–1,200.",
    "targetEntryPrice": "₹900–1,200 (EV/OI 20–25× on forward operating income)",
    "gate1": {
      "verdict": "PASS",
      "understandingStatement": "ABB India is a Bengaluru-based subsidiary of ABB Ltd Switzerland that manufactures and sells electrification equipment, industrial automation systems, and motion (drives & motors) to utilities, data centres, railways, and industrial customers in India, with ~15% revenue exported.",
      "parameters": {
        "products": "Industrial B2B manufactured goods and systems — Electrification (switchgear, transformers, EV infra), Motion (drives, motors), Process Automation (flow measurement, control systems). Robotics divested March 2026.",
        "customers": "Power utilities (NTPC, Adani Power), data centres, railways, metros, cement, steel, oil & gas, buildings. ~85% products manufactured locally.",
        "industry": "Heavy electrical equipment and industrial automation — capital goods sector",
        "form": "75%-owned subsidiary of ABB Ltd Switzerland. Strategy, capex, product portfolio, and business divestitures decided by Swiss parent. Robotics division slump-sold to ABB Robotics India Pvt Ltd for ₹1,568 Cr effective March 2026.",
        "geography": "Headquartered in Bengaluru. Manufacturing at 25 facilities across India. ~15% revenue exported. ~85% products are locally manufactured.",
        "status": "Listed on BSE/NSE since 1994. Market cap ~₹1,28,000 Cr. Large-cap, Nifty Next 50 constituent. 76 years of India operations."
      },
      "indiaFlags": ["Swiss parent holds exactly 75% — SEBI ceiling. No buyback possible without breaching limit.", "Royalty payments to ABB Switzerland for technology access — permanent profit drain", "Robotics divestment is parent-driven restructuring aligned with global ABB Group strategy"],
      "narrative": "ABB India passes Gate 1. Post-Robotics divestment (March 2026), the business is a clean 3-division electrification and automation play. The MNC parent structure is the key complexity — ABB India is managed as a global division of ABB Ltd, not as an independent listed company. This means minority shareholders benefit from world-class technology and brand but do not control strategic decisions. The divestment of Robotics (negative net worth contribution) is actually value-enhancing for the remaining business."
    },
    "gate2a": {
      "verdict": "PASS",
      "metrics": {
        "roce5yr": {"value": "28% avg (39% peak CY24)", "benchmark": "≥15%", "status": "PASS"},
        "roeLast": {"value": "22%", "benchmark": "≥15%", "status": "PASS"},
        "revenueCAGR5yr": {"value": "18%", "benchmark": "≥8%", "status": "PASS"},
        "patCAGR5yr": {"value": "57%", "benchmark": "≥8%", "status": "PASS"},
        "debtEquity": {"value": "~0× (effectively debt-free)", "benchmark": "≤1.5×", "status": "PASS"},
        "promoterPledge": {"value": "0%", "benchmark": "0%", "status": "PASS"},
        "ocfQuality": {"value": "~110%", "benchmark": "≥80%", "status": "PASS"}
      },
      "indiaFlags": ["CY25 PAT fell 11% YoY (₹1,668 Cr vs ₹1,872 Cr in CY24) — first profit decline after multi-year bull run", "OPM fell from 19% (CY24) to 15% (CY25) — watch for trend"],
      "narrative": "ABB India's historical performance is exceptional. The ROCE journey — 7% (CY20, COVID) → 16% (CY21) → 23% (CY22) → 31% (CY23) → 39% (CY24) → 30% (CY25) — is one of the most dramatic recoveries and expansions in Indian large-cap industrials. Revenue nearly tripled from ₹5,821 Cr (CY20) to ₹13,203 Cr (CY25). OCF is consistently positive and strong. CRISIL AAA/Stable rating reaffirmed. Debt-free balance sheet with net cash positive. The CY25 PAT decline is the first concern — partly from Robotics drag (now removed) and royalty increases. The order backlog at ₹10,471 Cr provides 9-month revenue visibility."
    },
    "gate2b": {
      "verdict": "PASS",
      "breadthAnalysis": {
        "customerBreadth": "PASS",
        "supplierBreadth": "PASS",
        "customerBreadthNote": "10+ verticals — power utilities, data centres, railways, metros, cement, steel. No single customer >10% of revenue.",
        "supplierBreadthNote": "~85% locally manufactured. ABB Group global supply chain and procurement muscle. No China supply-chain risk (local-for-local strategy)."
      },
      "forcesAnalysis": {
        "customerBargainingPower": "WEAK",
        "supplierBargainingPower": "WEAK",
        "threatSubstitutes": "LOW",
        "threatNewEntrants": "MODERATE",
        "overallForces": "FAVOURABLE"
      },
      "moat": {
        "exists": true,
        "type": "BRAND",
        "description": "ABB is one of the most recognised and trusted brands in global industrial electrification — 130+ years globally, 76 years in India. Switching cost moat: once ABB drives or switchgear are integrated into plant control systems, replacement requires downtime, recertification, and retraining. Technology moat: access to ABB Group's global R&D (ABB Ability digital platform, HVDC, EV charging) via licensing. Engineering specification lock-in: ABB products are pre-specified by engineering consultants (EPC companies like L&T) into project designs.",
        "durabilityRating": "STRONG"
      },
      "marketGrowth": {
        "rating": "STRONG",
        "description": "India power sector investment ₹35 lakh Cr over next decade. Data centre capacity 12 GW by 2030. Metro expansion 20+ cities. Railway Kavach ₹1.5 lakh Cr programme. Manufacturing PLI schemes driving factory automation demand. ABB is positioned at the intersection of all these themes."
      },
      "indiaFlags": ["Chinese players (Chint, TBEA, SANY) entering LV switchgear and transformers at lower prices — margin-compressive at commodity end", "Siemens India and Schneider Electric are established, well-capitalised direct competitors"],
      "narrative": "ABB India's competitive position is among the strongest of any Indian capital goods company. The brand+switching costs+technology access moat is deep and durable. However, the parent structure means the moat is partly sourced from ABB Switzerland's R&D — if royalty terms change or technology access is restricted, the moat narrows. Chinese competition at the commodity end is the primary risk but ABB's premium positioning insulates the core portfolio."
    },
    "gate2c": {
      "verdict": "CONDITIONAL",
      "indicators": {
        "promoterHolding": {"value": "75.00%", "trend": "STABLE", "status": "PASS"},
        "promoterPledge": {"value": "0%", "status": "PASS"},
        "dividendPayout": {"value": "50%", "status": "PASS"},
        "rptConcerns": {"value": "MINOR", "status": "WARN"},
        "auditQuality": {"value": "Big-4 affiliate, no qualified opinion, CRISIL AAA", "status": "PASS"}
      },
      "indiaFlags": ["Royalty payments to ABB Switzerland are a permanent, growing profit drain", "Robotics divestment at ₹1,568 Cr to group entity — independently valued by EY and Bansi S. Mehta, arm's length confirmed. But it's still parent-driven.", "75% promoter holding = SEBI maximum. No buyback possible without breaching limit."],
      "narrative": "ABB India's shareholder-friendliness gets a conditional pass. On the positive side: 50% dividend payout policy (CY23–CY24), zero promoter pledge, CRISIL AAA, and the Robotics divestment proceeds (₹1,568 Cr) returning cash. On the negative side: royalty charges to parent are growing and contributed to CY25 OPM compression; the parent controls all strategic decisions; and 75% holding means minority shareholders have limited voice. These are inherent features of MNC subsidiaries — acceptable only if priced in."
    },
    "gate3": {
      "verdict": "EXTREME_PREMIUM",
      "metrics": {
        "currentPrice": "₹6,050",
        "marketCap": "₹1,28,000 Cr",
        "evOI": {"value": "~62×", "benchmark": "≤7× strict / ≤12× India", "status": "FAIL"},
        "mcapFCF": {"value": "~123×", "benchmark": "≤15×", "status": "FAIL"},
        "priceBook": {"value": "~18×", "benchmark": "≤3×", "status": "FAIL"},
        "peRatio": {"value": "~77×", "status": "INFO"},
        "netCash": {"value": "Net cash positive (debt-free)", "status": "INFO"},
        "dividendYield": {"value": "0.65%", "status": "INFO"}
      },
      "valuationScenarios": {
        "bearCase": {"price": "₹320", "assumption": "EV/OI 7× on FY26E OI — Marshall strict limit"},
        "baseCase": {"price": "₹600", "assumption": "EV/OI 12× on FY26E OI — India-adjusted fair value"},
        "bullCase": {"price": "₹1,000", "assumption": "EV/OI 20× on FY27E OI — generous quality premium"}
      },
      "entryZone": "₹900–1,200",
      "indiaFlags": ["ABB India has historically traded at 50–100× P/E — market prices it as an option on India's long-term industrial capex story", "52-week low of ₹4,637 was briefly in the value zone at EV/OI ~23×"],
      "narrative": "ABB India decisively fails Gate 3. EV/OI ~62×, P/B ~18×, MCAP/FCF ~123×. The market perpetually prices ABB India at a massive premium to intrinsic value — even at the 52-week low of ₹4,637, EV/OI was ~23×. The business deserves a quality premium; 18× P/B for an 18-year-old re-listed entity is extreme. A value investor waits for ₹900–1,200 range. At current ₹6,050, you are paying for 7+ years of the India capex cycle at peak margins."
    },
    "keyRisks": [
      "Royalty payments to Swiss parent growing and compressing India entity margins — structural permanent drain",
      "CY25 PAT down 11% — watch for further pressure in CY26 as Robotics revenue gap is filled",
      "Chinese LV switchgear players (Chint) making inroads in utility procurement — commodity-end margin compression",
      "Any strategy shift by ABB Group affecting technology sharing or India operations"
    ],
    "catalysts": [
      "Data centre buildout in India accelerating — ABB's LV switchgear and UPS are key infrastructure components",
      "Robotics divestment proceeds (₹1,568 Cr) to be deployed in electrification and motion capacity expansion",
      "ABB global committing $75M India capex in 2026 — signals long-term commitment",
      "Railway Kavach safety signalling programme — significant LV and automation content"
    ],
    "comparablePeers": ["SIEMENS", "SCHNEIDER", "HAVELLS"],
    "dataQualityNote": "ABB India's fiscal year ends December. Analysis uses CY2025 data. Post-Robotics-divestment business (effective March 2026) means CY2026 will be the first clean year of the 3-division structure."
  },

  "KPITTECH": {
    "ticker": "KPITTECH",
    "company": "KPIT Technologies Ltd",
    "analysisDate": "2026-04-13",
    "overallVerdict": "WATCH",
    "verdictSummary": "KPIT is a genuine quality business — pure-play automotive software, ROCE 40%, founder-led, debt-free, 13,000 automotive engineers. The stock has fallen 50% from its ₹1,434 peak to ₹716 as OEM software spending slowed due to EV transition disruption and US auto tariffs. At ₹716, EV/OI is ~16× — approaching but not yet at the value entry of ₹620–650 (EV/OI ~13×). The investment thesis depends entirely on whether OEM software R&D spending resumes. Watch closely — verify Q4FY26 guidance before acting.",
    "targetEntryPrice": "₹620–650 (EV/OI ~13× on FY25 operating income)",
    "gate1": {
      "verdict": "PASS",
      "understandingStatement": "KPIT Technologies is a Pune-based pure-play automotive software engineering services company that helps global OEMs (BMW, Renault, Honda, Ford, GM) and Tier-1 suppliers build the software layer for software-defined vehicles — covering embedded systems, ADAS, powertrain electrification, connected vehicle platforms, and autonomous driving stacks — serving ~25 strategic global automotive clients.",
      "parameters": {
        "products": "IT services — automotive embedded software engineering, ADAS development, powertrain calibration, connected vehicle middleware, VehicleOS platform licensing",
        "customers": "Global automotive OEMs and Tier-1 suppliers. Top 25 strategic clients (T25) account for ~85% of revenues. BMW, Renault, Honda, Ford, GM, Stellantis among disclosed clients.",
        "industry": "IT services — automotive engineering services sub-segment. 100% revenue from automotive sector.",
        "form": "Pure-play automotive software company post 2019 demerger from Birlasoft. 13,000+ engineers globally. Subsidiaries in Europe, USA, Japan, China, Thailand.",
        "geography": "Headquartered in Pune. Development centres in India, Europe, Japan, China, Thailand, USA. Europe is largest revenue geography. Japan and US are growing.",
        "status": "Founded 1990 by Ravi Pandit and Kishor Patil. Listed on NSE/BSE since 2019 (post-demerger). Market cap ~₹19,600 Cr. Nifty Midcap 100."
      },
      "indiaFlags": ["Single-sector concentration (100% automotive) — no diversification buffer when OEM capex tightens", "T25 clients = 85% of revenue — high product/client concentration"],
      "narrative": "KPIT passes Gate 1. The business is clear and focused — automotive software engineering for the software-defined vehicle transition. The 2019 demerger (keeping only automotive, spinning off Birlasoft for IT services) was a bold, high-conviction call that proved prescient for FY21–FY25. The single-sector concentration is simultaneously the business's strength (deep domain expertise) and its main vulnerability."
    },
    "gate2a": {
      "verdict": "CONDITIONAL",
      "metrics": {
        "roce5yr": {"value": "30% avg (40% peak FY25)", "benchmark": "≥15%", "status": "PASS"},
        "roeLast": {"value": "33%", "benchmark": "≥15%", "status": "PASS"},
        "revenueCAGR5yr": {"value": "22%", "benchmark": "≥8%", "status": "PASS"},
        "patCAGR5yr": {"value": "40%", "benchmark": "≥8%", "status": "PASS"},
        "debtEquity": {"value": "~0.1× (net cash positive)", "benchmark": "≤1.5×", "status": "PASS"},
        "promoterPledge": {"value": "0%", "benchmark": "0%", "status": "PASS"},
        "ocfQuality": {"value": "130%", "benchmark": "≥80%", "status": "PASS"}
      },
      "indiaFlags": ["FY26 earnings in active multi-quarter decline: Q3FY26 PAT −29% YoY, missed estimates by 30%", "Revenue growth decelerated from 45% (FY24) → 20% (FY25) → single-digit (H1FY26)"],
      "narrative": "KPIT's historical performance through FY25 is excellent. The ROCE progression — 14% (FY21) → 25% (FY22) → 30% (FY23) → 38% (FY24) → 40% (FY25) — is a continuous improvement story. FCF CAGR is impressive: ₹568 Cr (FY21) → ₹1,262 Cr (FY25). CFO/Operating Profit of 130% confirms high earnings quality — cash is real. Debtor days improving to 47 days. Net cash positive. These are all strong positive signals. HOWEVER: FY26 has been a sharp reversal. Multi-quarter PAT decline is not a blip — it reflects structural OEM capex tightening. The 5-year record earns a conditional pass; the FY26 trend demands explanation before buying."
    },
    "gate2b": {
      "verdict": "CONDITIONAL",
      "breadthAnalysis": {
        "customerBreadth": "FAIL",
        "supplierBreadth": "PASS",
        "customerBreadthNote": "100% automotive revenue. T25 clients = 85% of revenue. Single-sector concentration fails Marshall's breadth requirement — no diversification when OEM capex tightens.",
        "supplierBreadthNote": "13,000 engineers recruited from engineering universities globally. Multiple talent sources across India, Europe, Japan. No single supplier concentration."
      },
      "forcesAnalysis": {
        "customerBargainingPower": "MODERATE",
        "supplierBargainingPower": "WEAK",
        "threatSubstitutes": "MODERATE",
        "threatNewEntrants": "LOW",
        "overallForces": "MIXED"
      },
      "moat": {
        "exists": true,
        "type": "SWITCHING_COSTS",
        "description": "Once KPIT's engineers are embedded in an OEM's software architecture (AUTOSAR stack, powertrain calibration, ADAS middleware), replacing them mid-programme is extremely disruptive. A typical automotive software programme lasts 3–7 years. Domain expertise ingrainedness — 34-year automotive focus means KPIT speaks the OEM's technical language. JV with major European OEM for co-developing centralised EV computing architecture (2024, $350M+ value) is a moat deepener. But this is a talent+relationship moat, not a brand or network moat — it requires constant reinvestment.",
        "durabilityRating": "MODERATE"
      },
      "marketGrowth": {
        "rating": "STRONG",
        "description": "Long-term: software content per vehicle to triple by 2030. SDV transition, ADAS proliferation, EV complexity. Near-term disrupted: US 25% auto tariff, European OEM cost-cutting, Chinese OEM vertical integration (BYD). Long-term bull case intact; near-term cloudy."
      },
      "indiaFlags": ["Chinese OEM vertical integration (BYD, NIO doing all software in-house) is forcing European OEMs to cut outsourcing", "US auto tariffs deferring OEM capex and programme timelines globally"],
      "narrative": "KPIT's qualitative picture is mixed. The moat is real but narrower than perceived — it's a talent+relationship moat that must be continually earned. The simultaneous headwinds (US tariffs, EV slowdown, Chinese competition, OEM in-house insourcing) are not noise — they are structural pressures on the exact spending category KPIT lives in. The 100% automotive concentration is the key vulnerability. Management must be watched closely to verify the FY26 trough is temporary."
    },
    "gate2c": {
      "verdict": "CONDITIONAL",
      "indicators": {
        "promoterHolding": {"value": "39.4% (declining)", "trend": "DECLINING", "status": "WARN"},
        "promoterPledge": {"value": "0%", "status": "PASS"},
        "dividendPayout": {"value": "28–31%", "status": "PASS"},
        "rptConcerns": {"value": "NONE", "status": "PASS"},
        "auditQuality": {"value": "Big-4, no qualified opinion", "status": "PASS"}
      },
      "indiaFlags": ["Promoter holding only 39.4% and declining (was 41.65% in FY20) — lowest of any quality IT company in India", "FII holding fell from 26.5% (Dec 2023) to 13.6% (Dec 2025) — 13pp exodus in 2 years"],
      "narrative": "KPIT's governance is clean but the low promoter holding is a genuine concern. Founders Kishor Patil and Ravi Pandit hold ~39.4% combined — this is below the 50% threshold most Indian value investors prefer. Zero pledge is positive. The FII exodus mirrors the earnings deceleration story and is a bearish institutional signal. DII absorption (12% → 25% in 2 years) partially offsets this. Management was transparent on earnings calls about headwinds — no sugar-coating of the slowdown."
    },
    "gate3": {
      "verdict": "FAIR_VALUE",
      "metrics": {
        "currentPrice": "₹716",
        "marketCap": "₹19,600 Cr",
        "evOI": {"value": "~16×", "benchmark": "≤7× strict / ≤12× India", "status": "WARN"},
        "mcapFCF": {"value": "~16×", "benchmark": "≤15×", "status": "WARN"},
        "priceBook": {"value": "~6×", "benchmark": "≤3×", "status": "FAIL"},
        "peRatio": {"value": "~27×", "status": "INFO"},
        "netCash": {"value": "Net cash positive", "status": "INFO"},
        "dividendYield": {"value": "1.3%", "status": "INFO"}
      },
      "valuationScenarios": {
        "bearCase": {"price": "₹550", "assumption": "EV/OI 10× if OEM cuts deepen — 5% OI decline in FY27"},
        "baseCase": {"price": "₹720", "assumption": "EV/OI 13× on FY25 OI — base value zone"},
        "bullCase": {"price": "₹900", "assumption": "EV/OI 16× if OEM spending resumes and 25% OI growth in FY27"}
      },
      "entryZone": "₹620–650",
      "indiaFlags": ["Stock fell 50% from ₹1,434 (peak) to ₹716 — most of the easy money has been made in the re-rating DOWN. Now it's a question of when to buy on the re-rating UP."],
      "narrative": "KPIT is approaching value territory for the first time since its 2019 re-listing. At ₹716, EV/OI is ~16× — above the India-adjusted value entry of 12–13× but the closest it has been. The 52-week low of ₹624.90 touched the value zone briefly. Three questions to answer before buying: (1) Is Q4FY26 recovery genuine or guided? (2) Has any T25 client cancelled a programme? (3) Are OEM deferrals 6-month or multi-year? If the answers are reassuring, ₹620–650 is a high-conviction entry with a 3–5 year holding horizon."
    },
    "keyRisks": [
      "Multi-quarter earnings decline continuing into FY27 if OEM capex cuts are multi-year",
      "Chinese OEM vertical integration forcing European OEMs to insource more software",
      "US 25% auto import tariff creating multi-year OEM capex deferral beyond current expectations",
      "Promoter holding declining below 35% — would further weaken founder control"
    ],
    "catalysts": [
      "Q4FY26 results confirming management guidance for recovery",
      "New T25 client addition or major programme win announcement",
      "Semaglutide/Risdiplam-equivalent event — a new large automotive OEM signing KPIT as SDV partner",
      "OEM tariff clarity — trade deal or tariff rollback restoring OEM capex confidence"
    ],
    "comparablePeers": ["TATAELXSI", "LTTS", "MPHASIS"],
    "dataQualityNote": "KPIT's demerger from Birlasoft in 2019 means pre-2019 financials are not comparable. Analysis uses FY20–FY26 data only (7 years post-demerger)."
  },

  "NATCOPHARM": {
    "ticker": "NATCOPHARM",
    "company": "Natco Pharma Ltd",
    "analysisDate": "2026-04-13",
    "overallVerdict": "BUY",
    "verdictSummary": "Natco is the most compelling value situation in this series. EV/OI ~7.4× (within Marshall's strict 7× limit), P/B ~2.3× (below 3×), net cash of ₹3,500 Cr providing a hard floor. The gRevlimid exclusivity ended January 2026 creating a known earnings trough — but Natco has ₹3,500 Cr cash, zero net debt, a 30-year Para IV track record, semaglutide India launch (March 2026), and 20 active Para IV pipeline entries. This is the classic Marshall setup: good business temporarily depressed by a known, finite, survivable earnings event.",
    "targetEntryPrice": "₹1,000–1,150 (EV/OI at or near Marshall's threshold — current price is the value zone)",
    "gate1": {
      "verdict": "PASS",
      "understandingStatement": "Natco Pharma is a Hyderabad-based vertically-integrated specialist pharma company that generates premium returns by filing Para IV patent challenges on off-patent blockbuster drugs in the US, manufacturing APIs and formulations, and selling through US partners under profit-sharing arrangements — while running a domestic India branded formulations business, an agrochemicals division (being demerged), and holding a 25%+ stake in South African pharma company Adcock Ingram.",
      "parameters": {
        "products": "Pharmaceutical formulations (US exports ~44%), domestic India branded generics (oncology, hepatology), APIs, agrochemicals (being demerged Oct 2026). Strategy: 'chasing jackpots' — Para IV first-wave exclusivity on blockbuster drugs.",
        "customers": "US: Teva, Mylan, Lupin, Alvogen (profit-sharing partners). India: Retail doctors and hospitals for branded generics in oncology/hepatology. South Africa: via Adcock Ingram stake.",
        "industry": "Specialty pharmaceuticals — Para IV patent challenge generics and domestic branded formulations",
        "form": "Standalone manufacturer with API + formulation vertical integration. 10 manufacturing facilities. Agrochemicals demerger approved (1:1 share swap into Natco Crop Health Sciences, Appointed Date Oct 1, 2026). Adcock Ingram South Africa (~25% stake).",
        "geography": "Headquartered in Hyderabad. Manufacturing in Andhra Pradesh (multiple facilities). US is primary export market. South Africa via Adcock Ingram.",
        "status": "Founded 1981 by V.C. Nannapaneni family. Small-cap but high-quality. Known for Revlimid (gRevlimid) exclusivity FY22–FY26."
      },
      "indiaFlags": ["Para IV model creates intentionally lumpy earnings — must model through trough years, not just peak years", "Agrochemicals demerger (1:1) creates bonus value for existing shareholders"],
      "narrative": "Natco passes Gate 1 with one important caveat: the business model is not a conventional compounder — management openly describes their strategy as 'chasing jackpots.' The Para IV model is well-understood: file patent challenges on blockbuster drugs, win exclusivity, extract windfall profits for 2–4 years, face a reset when competitors enter. This creates lumpy non-linear earnings that require cycle-aware analysis rather than simple trend extrapolation. Post-Revlimid and post-agrochemicals-demerger, the business is simpler and cleaner."
    },
    "gate2a": {
      "verdict": "CONDITIONAL",
      "metrics": {
        "roce5yr": {"value": "~22% normalised (33% FY25 peak)", "benchmark": "≥15%", "status": "PASS"},
        "roeLast": {"value": "28%", "benchmark": "≥15%", "status": "PASS"},
        "revenueCAGR5yr": {"value": "18%", "benchmark": "≥8%", "status": "PASS"},
        "patCAGR5yr": {"value": "33%", "benchmark": "≥8%", "status": "PASS"},
        "debtEquity": {"value": "0.04× (net cash positive)", "benchmark": "≤1.5×", "status": "PASS"},
        "promoterPledge": {"value": "0%", "benchmark": "0%", "status": "PASS"},
        "ocfQuality": {"value": "94%", "benchmark": "≥80%", "status": "PASS"}
      },
      "indiaFlags": ["ROCE trough year: FY22 = 4% (between jackpots). Model through the full cycle.", "FY27 PAT trough likely ₹700–900 Cr (vs FY25 peak ₹1,883 Cr) — a ~50% decline from peak"],
      "narrative": "Natco's 10-year ROCE average of ~20–22% passes Marshall's 15% floor even after smoothing all the jackpot spikes. ROCE during exclusivity periods: FY17 39% (gCopaxone), FY25 33% (gRevlimid). ROCE in trough years: FY22 4%, FY20 14%. The business survives trough years without distress — confirmed by ICRA AA−/Stable through multiple cycles. FCF FY25 = ₹1,300 Cr on market cap of ₹19,750 Cr gives FCF yield of 6.6%. CFO/Operating Profit = 94% — earnings quality is real. Net cash ₹3,500 Cr = ~18% of market cap. The FY27 trough is real but: (1) known and finite; (2) survivable with ₹3,500 Cr cash; (3) normal for this model."
    },
    "gate2b": {
      "verdict": "PASS",
      "breadthAnalysis": {
        "customerBreadth": "WARN",
        "supplierBreadth": "PASS",
        "customerBreadthNote": "US export formulations dominated by 1–3 molecules at any time (gRevlimid was ~80% of US export revenue FY24/25). This is product concentration, not customer concentration. Domestic India business (~28% revenue) provides base at lower margins.",
        "supplierBreadthNote": "Vertically integrated — manufactures own APIs for key products. No dependence on Chinese APIs for core oncology portfolio. Multiple green chemistry synthesis routes."
      },
      "forcesAnalysis": {
        "customerBargainingPower": "WEAK",
        "supplierBargainingPower": "WEAK",
        "threatSubstitutes": "LOW",
        "threatNewEntrants": "LOW",
        "overallForces": "FAVOURABLE"
      },
      "moat": {
        "exists": true,
        "type": "COST",
        "description": "Para IV litigation capability moat: filing and winning Para IV challenges requires deep patent law expertise, scientific 'invalidity' arguments, and capital to fight multi-year litigation. 30-year track record of winning/settling Para IVs (Revlimid, Copaxone, Afinitor, Tamiflu). Vertical integration moat: self-manufactured APIs achieve gross margins of 60–87% on US exports — unmatched in Indian generic pharma. 44 approved US ANDAs, 20 active Para IV filings (Dec 2025).",
        "durabilityRating": "STRONG"
      },
      "marketGrowth": {
        "rating": "STRONG",
        "description": "US generic drug market $500Bn+, growing. GLP-1 agonist market (semaglutide) $50Bn+ by 2030 globally. India domestic pharma ₹2.5 lakh Cr growing 8–10% p.a. Emerging markets via Adcock (South Africa, MENA, LATAM). All markets growing."
      },
      "indiaFlags": ["Semaglutide India launch (March 2026) at ₹1,290 — first mover in multi-dose vials, 70% cheaper than Ozempic pen", "Risdiplam (SMA drug, ~$2.5Bn US market) Para IV filed — potential first-wave launch"],
      "narrative": "Natco's competitive position is unique and strong. The Para IV litigation capability moat is real and rare — fewer than 5 Indian companies can credibly fight multi-year US patent litigation against global pharma giants. The vertical integration delivering 60–87% gross margins on US exports is extraordinary. The pipeline is credible: semaglutide India is now launched, US semaglutide Para IV is in the works, Risdiplam is filed. Management's 30-year track record of finding and winning the next jackpot is the key qualitative data point."
    },
    "gate2c": {
      "verdict": "CONDITIONAL",
      "indicators": {
        "promoterHolding": {"value": "49.4% (declining slowly)", "trend": "DECLINING", "status": "WARN"},
        "promoterPledge": {"value": "0%", "status": "PASS"},
        "dividendPayout": {"value": "6% (FY25) — very low", "status": "WARN"},
        "rptConcerns": {"value": "NONE", "status": "PASS"},
        "auditQuality": {"value": "Reputable domestic auditor, no qualified opinion, ICRA AA−/Stable", "status": "PASS"}
      },
      "indiaFlags": ["Dividend payout only 6% in FY25 despite ₹1,883 Cr PAT — management retaining cash for Adcock acquisition and R&D", "Promoter just below 50% — borderline. Dilution from Adcock acquisition funding brought it down."],
      "narrative": "Natco's governance gets a conditional pass. The positives: management candour on earnings calls is exceptional — they explicitly warned investors about the Revlimid cliff quarters in advance, never sugar-coated the trough. Zero promoter pledge. ICRA AA−/Stable maintained through trough years. The negatives: 6% dividend payout in the peak earnings year (FY25) retains too much cash without clear near-term deployment plan; promoter at 49.4% just below 50%. The Adcock Ingram acquisition (₹2,000+ Cr) and oligonucleotide R&D are credible uses of capital — the low payout is strategically justified if these investments pay off."
    },
    "gate3": {
      "verdict": "VALUE_BUY",
      "metrics": {
        "currentPrice": "₹1,104",
        "marketCap": "₹19,750 Cr",
        "evOI": {"value": "~7.4×", "benchmark": "≤7× strict / ≤12× India", "status": "PASS"},
        "mcapFCF": {"value": "~15×", "benchmark": "≤15×", "status": "PASS"},
        "priceBook": {"value": "2.3×", "benchmark": "≤3×", "status": "PASS"},
        "peRatio": {"value": "~13×", "status": "INFO"},
        "netCash": {"value": "₹3,500 Cr (18% of market cap)", "status": "INFO"},
        "dividendYield": {"value": "0.58%", "status": "INFO"}
      },
      "valuationScenarios": {
        "bearCase": {"price": "₹800", "assumption": "FY27 PAT falls to ₹500 Cr and no new Para IV wins — markets re-rates lower"},
        "baseCase": {"price": "₹1,200", "assumption": "FY27 trough ₹750 Cr, semaglutide India ramps, Risdiplam filed — P/E re-rates to 18×"},
        "bullCase": {"price": "₹1,800", "assumption": "New Para IV exclusivity announced, Risdiplam approved, semaglutide US timeline confirmed"}
      },
      "entryZone": "₹1,000–1,150",
      "indiaFlags": ["₹3,500 Cr net cash = hard floor on downside. Even if FY27 is a trough, cash protects.", "The market is pricing in the known Revlimid cliff — classic 'fear of the known' that Marshall exploits"],
      "narrative": "Natco is the only stock in this series to genuinely pass Gate 3. EV/OI = 7.4× (within Marshall's strict 7× limit after netting ₹3,500 Cr cash). P/B = 2.3× (below 3×). MCAP/FCF = 15× (at the India-adjusted limit). These are the best valuation metrics in the series. The market is depressing the price because of the known Revlimid cliff — but this cliff is: (1) known and already partially happened; (2) finite (Revlimid goes fully generic); (3) survivable with ₹3,500 Cr cash buffer. The classic value setup: good business, temporary earnings trough, specific survivable reason for depression, strong pipeline for recovery. Buy ₹1,000–1,150, hold 3–5 years, wait for the next Para IV announcement."
    },
    "keyRisks": [
      "FY27 earnings trough deeper than expected if no new Para IV exclusivity is won — P/E re-rates higher on lower earnings",
      "Adcock Ingram South Africa acquisition not generating expected returns — ₹2,000+ Cr deployed in emerging market pharma",
      "Semaglutide India market proving smaller than expected (generic competition from Eris, Sun Pharma, others)",
      "Promoter holding dipping below 45% due to further dilution"
    ],
    "catalysts": [
      "New Para IV first-wave exclusivity announcement (Risdiplam or other pipeline entry)",
      "Semaglutide US filing or Para IV settlement announcement",
      "Agrochemicals demerger listing (Natco Crop Health Sciences) — unlocks hidden value",
      "Adcock Ingram South Africa equity income starting to show in consolidated P&L"
    ],
    "comparablePeers": ["DRREDDY", "CIPLA", "SUNPHARMA", "AJANTPHARM"],
    "dataQualityNote": "Para IV model creates inherent data complexity — FY22 ROCE of 4% and FY25 ROCE of 33% are both 'true' numbers for different points in the jackpot cycle. Analysis uses 10-year normalised averages for cycle-aware assessment."
  },

  "CCL": {
    "ticker": "CCL",
    "company": "CCL Products (India) Ltd",
    "analysisDate": "2026-04-13",
    "overallVerdict": "WATCH",
    "verdictSummary": "CCL Products is the world's largest private-label instant coffee manufacturer with a genuine multi-source moat (Vietnam cost advantage, 1,000+ proprietary blends, 250+ global brand clients). The business model is elegant — B2B cost-plus with no commodity risk, 250+ client breadth, and a proven dual India+Vietnam manufacturing strategy. However ROCE has declined from 27% (FY17) to 12–13% (FY24-25) — below Marshall's 15% threshold — due to debt-funded Vietnam capex. Stock has doubled from ₹525 to ₹1,078 in 12 months, pricing in the ROCE recovery thesis. Wait for ₹600–650.",
    "targetEntryPrice": "₹600–650 (EV/OI ~12× on forward OI — currently at ~23×)",
    "gate1": {
      "verdict": "PASS",
      "understandingStatement": "CCL Products is a Hyderabad-based B2B instant coffee processing company that sources green coffee beans from Vietnam and India, processes them into spray-dried and freeze-dried instant coffee powders using 1,000+ proprietary blends, and sells these as private-label products to 250+ global FMCG brands across 100+ countries — while building a B2C retail brand (Continental Coffee) in India.",
      "parameters": {
        "products": "B2B private-label instant coffee — spray-dried (higher volume, lower margin) and freeze-dried (lower volume, 40–50% higher margin). 1,000+ proprietary blends. Also building B2C Continental Coffee brand (~5-6% of revenue).",
        "customers": "250+ global FMCG brands including Nestlé, Unilever, JDE (Jacobs Douwe Egberts), Tata. No single customer dominates. Back-to-back pricing model hedges commodity risk.",
        "industry": "Coffee processing and manufacturing — B2B private label is the primary revenue source. B2C retail is a nascent segment.",
        "form": "Four manufacturing facilities: India (2 plants, Andhra Pradesh), Vietnam (Ngon Coffee, Dak Lak province — expansion completed FY23), Switzerland (packaging arm). EOU status for India plants.",
        "geography": "Headquartered in Hyderabad. Manufacturing in India, Vietnam, Switzerland. Exports to 100+ countries. Vietnam gives ASEAN duty-free access to 685M population.",
        "status": "Founded 1994. World's largest private-label instant coffee manufacturer. ~10% global private-label market share. India's largest instant coffee exporter (38% market share)."
      },
      "indiaFlags": ["Vietnam tax-free status (0% corporate tax for new plant) is a significant permanent advantage over India-only competitors", "US tariff on Indian coffee navigated via Vietnam — demonstrated operational hedge"],
      "narrative": "CCL passes Gate 1 with high marks. The business model is elegant and simple: buy Robusta beans from world's largest growing region (Vietnam), process with proprietary R&D, sell as private-label to global FMCG giants on a cost-plus basis. The back-to-back contract model (fixed-price purchase + sale) eliminates commodity price risk — a rare and valuable feature. The growing Continental Coffee B2C brand is a potential long-term margin-improvement lever but should not be overweighted in current analysis."
    },
    "gate2a": {
      "verdict": "FAIL",
      "metrics": {
        "roce5yr": {"value": "13% avg (peak 27% FY17)", "benchmark": "≥15%", "status": "FAIL"},
        "roeLast": {"value": "17%", "benchmark": "≥15%", "status": "PASS"},
        "revenueCAGR5yr": {"value": "22%", "benchmark": "≥8%", "status": "PASS"},
        "patCAGR5yr": {"value": "13%", "benchmark": "≥8%", "status": "PASS"},
        "debtEquity": {"value": "0.9×", "benchmark": "≤1.5×", "status": "WARN"},
        "promoterPledge": {"value": "0%", "benchmark": "0%", "status": "PASS"},
        "ocfQuality": {"value": "~65%", "benchmark": "≥80%", "status": "WARN"}
      },
      "indiaFlags": ["Screener flags 'Company might be capitalising interest cost' — inflates reported profits during capex cycle", "Debt grew 13× from ₹142 Cr (FY17) to ₹1,815 Cr (FY25) — faster than EBITDA growth"],
      "narrative": "CCL Products fails Gate 2a on the most important metric. ROCE has declined continuously from 27% (FY17) to 12–13% (FY24-25) — an 8-year downward trend, not a single bad year. The cause is unambiguous: large debt-funded capex cycle. Borrowings grew 13× as the Vietnam expansion and India freeze-dried capacity were built. Interest costs rose from ₹8 Cr (FY18) to ₹113 Cr (FY25) — a 14× increase. Despite revenue tripling, ROCE was halved. PAT CAGR of only 13% over 5 years is modest for a 'growth' stock. The RECOVERY thesis is credible: Vietnam expansion is now fully commissioned, utilisation should ramp driving ROCE back to 15–18% by FY27. But Marshall would not buy on 'future ROCE recovery' — he buys on demonstrated historical ROCE above 15%."
    },
    "gate2b": {
      "verdict": "PASS",
      "breadthAnalysis": {
        "customerBreadth": "PASS",
        "supplierBreadth": "PASS",
        "customerBreadthNote": "250+ global FMCG brands across 100+ countries. No single customer >10% of revenue. Cleanest customer breadth profile in this entire 5-company series.",
        "supplierBreadthNote": "Robusta beans from Vietnam (Dak Lak province direct), India, Brazil. Global commodity with multiple sources. No single supplier leverage. Vietnam proximity provides 15–20% cost advantage."
      },
      "forcesAnalysis": {
        "customerBargainingPower": "MODERATE",
        "supplierBargainingPower": "WEAK",
        "threatSubstitutes": "LOW",
        "threatNewEntrants": "LOW",
        "overallForces": "FAVOURABLE"
      },
      "moat": {
        "exists": true,
        "type": "COST",
        "description": "Multi-source moat: (1) Cost moat — Vietnam plant in Dak Lak province, 15–20% procurement cost advantage vs India-only competitors, zero corporate tax, ASEAN duty-free. (2) Ingrainedness moat — 1,000+ proprietary blends developed over 30 years with each client. Changing supplier means reformulating the blend, requalifying retail chains, reprinting packaging — high switching costs for what looks like a commodity product. (3) Scale moat — 71,000+ MTPA capacity across 4 plants, no Indian competitor matches. (4) Technology moat — India's first freeze-dried coffee plant (2005), 20-year head start in premium segment.",
        "durabilityRating": "MODERATE"
      },
      "marketGrowth": {
        "rating": "STRONG",
        "description": "Global instant coffee market $35Bn+, growing 5–6% p.a. Asia-Pacific fastest growing. Freeze-dried premium segment growing 10%+ p.a. India instant coffee growing 12% p.a. B2C Continental Coffee has room to grow in India's underpenetrated instant coffee market."
      },
      "indiaFlags": ["US tariff bypass via Vietnam is now demonstrated — CCL seamlessly rerouted US-bound volumes through Vietnam when India-specific tariffs hit", "Continental Coffee is #3 in India instant coffee — real consumer brand building, not aspirational"],
      "narrative": "CCL's qualitative competitive position is strong — arguably stronger than its current ROCE suggests. The Vietnam strategic decision (made 2015–2016) was prescient: it created a location-based cost moat, a tax moat, and a tariff bypass moat simultaneously. The custom blend ingrainedness is underappreciated — this is not a commodity business that can be switched on price alone. The market breadth (250+ clients, 100+ countries) is the cleanest breadth profile in this series. The US tariff navigation via Vietnam was a live demonstration of the moat in action."
    },
    "gate2c": {
      "verdict": "CONDITIONAL",
      "indicators": {
        "promoterHolding": {"value": "46.1% (slowly declining)", "trend": "DECLINING", "status": "WARN"},
        "promoterPledge": {"value": "0%", "status": "PASS"},
        "dividendPayout": {"value": "22%", "status": "PASS"},
        "rptConcerns": {"value": "NONE", "status": "PASS"},
        "auditQuality": {"value": "Reputable domestic auditor, no qualified opinion", "status": "PASS"}
      },
      "indiaFlags": ["Interest capitalisation concern — investigate annual report Note disclosures", "Promoter below 50% and declining (was ~51% in FY17)"],
      "narrative": "CCL's governance is clean on most dimensions — no RPT concerns, zero promoter pledge, consistent dividends. The two flags are: promoter holding at 46.1% (below 50% and drifting lower) and interest capitalisation (which inflates reported profits during capex cycles). Both require monitoring. DII accumulation from 5% to 21.5% over 8 years is a strong positive signal of institutional quality recognition. Management has been transparent about capex timeline and EBITDA growth guidance."
    },
    "gate3": {
      "verdict": "EXPENSIVE",
      "metrics": {
        "currentPrice": "₹1,078",
        "marketCap": "₹14,500 Cr",
        "evOI": {"value": "~23×", "benchmark": "≤7× strict / ≤12× India", "status": "FAIL"},
        "mcapFCF": {"value": "~45×", "benchmark": "≤15×", "status": "FAIL"},
        "priceBook": {"value": "6.9×", "benchmark": "≤3×", "status": "FAIL"},
        "peRatio": {"value": "~38–70×", "status": "INFO"},
        "netCash": {"value": "Net debt ₹1,600 Cr", "status": "INFO"},
        "dividendYield": {"value": "0.5%", "status": "INFO"}
      },
      "valuationScenarios": {
        "bearCase": {"price": "₹380", "assumption": "EV/OI 7× on FY25 OI — Marshall strict"},
        "baseCase": {"price": "₹620", "assumption": "EV/OI 12× on FY26E OI — India-adjusted entry value"},
        "bullCase": {"price": "₹900", "assumption": "EV/OI 15× on FY27E OI after ROCE recovery to 18%+"}
      },
      "entryZone": "₹600–650",
      "indiaFlags": ["Stock has doubled in 12 months (₹525 → ₹1,078), pricing in ROCE recovery before it has actually happened", "52-week low of ₹525 was the value zone — that opportunity has passed for now"],
      "narrative": "CCL decisively fails Gate 3. EV/OI ~23×, P/B ~7×, MCAP/FCF ~45× — all well above Marshall's thresholds. The stock has already doubled in 12 months, pricing in the capex-cycle-completion and ROCE-recovery thesis. The 52-week low of ₹525 was exactly in the value zone (EV/OI ~12×). At ₹1,078, there is no margin of safety. To buy at this price requires believing: (1) ROCE recovers to 15%+ by FY27, (2) revenue grows another 20–25%, and (3) the market sustains a 20×+ EV/OI multiple for a manufacturing business. Marshall would say: wait for ₹600–650 where the margin of safety is restored."
    },
    "keyRisks": [
      "ROCE recovery delayed if Vietnam utilisation ramps slower than expected",
      "Interest capitalisation — once capex assets are commissioned, depreciation charges rise sharply, compressing future margins",
      "Green coffee commodity price spike would inflate working capital and pressure OCF despite back-to-back model",
      "Continental Coffee brand investment burns cash without proportionate revenue for several years"
    ],
    "catalysts": [
      "Vietnam utilisation hitting 80%+ — triggers operating leverage and ROCE recovery to 15%+",
      "FCF turning meaningfully positive in FY26–FY27 as capex normalises",
      "Continental Coffee crossing ₹500 Cr B2C revenue — signals successful B2C transition",
      "Any global FMCG brand award of a multi-year large-volume exclusive supply contract"
    ],
    "comparablePeers": ["TATACOFFEE", "NESLEINDIA", "VSTIND"],
    "dataQualityNote": "CCL's interest capitalisation practice requires verification in annual report notes. Reported PAT may be modestly overstated during the capex cycle. Analysis uses consolidated financials throughout."
  }
};

module.exports = DEMO_ANALYSES;

/**
 * TaxPlot — Tax Engine
 * Income Tax Act, 2025 (FY 2026-27 / AY 2027-28), section numbers per the
 * project's dual-numbering convention: new number first, old (1961 Act) in brackets.
 *
 * ⚠️ [VERIFY BEFORE SHIPPING] — every rupee figure below was checked against
 * public sources as of Aug 2026 (Budget 2026 made no slab/cap changes vs FY 2025-26).
 * Re-verify against incometax.gov.in / ClearTax / Tax2win each filing season —
 * caps, slabs, and the HRA city list are set by annual Budget announcements.
 *
 * ---- Single source of truth ----
 * Every rupee figure, rate, slab, and threshold used anywhere in the app lives
 * in TAX_CONFIG below. app.js must never hardcode a rupee amount — read it
 * from TaxEngine.* instead so there's exactly one place to update each year.
 */

// ============================================================
// TAX_CONFIG — all tax figures, caps, slabs, rebate, standard deduction, HRA
// ============================================================
const TAX_CONFIG = {
  // Financial year window + statutory deadlines shown across both apps.
  fyLabel: "FY 2026–27", fyStart: "2026-04-01", fyEnd: "2027-03-31", // [VERIFY] AY 2027-28; FY dates are fixed by statute but re-check the label each year
  deadlines: [
    { date: "2026-06-15", label: "Advance tax · 1st instalment", who: "Clients with business or freelance income" }, // [VERIFY]
    { date: "2026-09-15", label: "Advance tax · 2nd instalment", who: "Clients with business or freelance income" }, // [VERIFY]
    { date: "2026-12-15", label: "Advance tax · 3rd instalment", who: "Clients with business or freelance income" }, // [VERIFY]
    { date: "2027-03-15", label: "Advance tax · 4th instalment", who: "Clients with business or freelance income; presumptive filers (Section 44ADA/44AD) may pay the full year's advance tax in this one instalment" }, // [VERIFY] patronaccounting.com; caclubindia.com
    { date: "2027-03-31", label: "Last day to invest for FY 2026–27", who: "Section 123 (80C), 124 (80CCD(1B)), 126 (80D)" }, // [VERIFY]
    { date: "2027-03-31", label: "Revised return due", who: "Anyone who needs to correct a filed return" }, // [VERIFY]
    { date: "2027-07-31", label: "ITR due · ITR-1/ITR-2", who: "Salaried with no business/professional income" }, // [VERIFY]
    { date: "2027-08-31", label: "ITR due · ITR-3/ITR-4 non-audit cases", who: "Freelancers and small businesses (non-audit) — permanent from AY 2026-27, Finance Act 2026" }, // [VERIFY] patronaccounting.com; caclubindia.com
    { date: "2027-10-31", label: "ITR due · audit cases", who: "Businesses/professionals requiring a tax audit" }, // [VERIFY] AY 2027-28 standard date; AY 2026-27 was extended to 21 Nov 2026 as a one-off
  ],

  // Rent — landlord PAN + TDS thresholds (not yet surfaced in the UI; feeds the rent helper).
  landlordPanThresholdAnnualRent: 100000, // [VERIFY] landlord PAN required/collected if annual rent exceeds this
  rentTDS: {
    sectionNew: "393(1) Table Sl.2(i)", sectionOld: "194-IB", // [VERIFY] taxheal.com
    thresholdMonthly: 50000, // [VERIFY] TDS applies once monthly rent crosses this
    ratePanProvided: 0.02, // [VERIFY] 2% when landlord's PAN is on file
    rateNoPan: 0.20, // [VERIFY] 20% when landlord has no PAN
    formNew: "Form 141 Sch A", formOld: "Form 26QC", // [VERIFY] cleartax.in; themunim.com
  },

  // Progressive slab tables: [ceiling, rate] pairs, ceiling=Infinity for the top slab.
  newRegimeSlabs: [
    [400000, 0],
    [800000, 0.05],
    [1200000, 0.10],
    [1600000, 0.15],
    [2000000, 0.20],
    [2400000, 0.25],
    [Infinity, 0.30],
  ], // [VERIFY] Finance Act 2025 7-slab structure, unchanged by Budget 2026

  oldRegimeSlabs: [
    [250000, 0],
    [500000, 0.05],
    [1000000, 0.20],
    [Infinity, 0.30],
  ], // [VERIFY] Old regime slabs for individuals under 60 — kept as the default/alias of oldRegimeSlabsByAge.under60

  // Old regime nil bands by age — seniors (60-79) get a ₹3L nil band, super
  // seniors (80+) get ₹5L. Rates above the nil band are unchanged. [VERIFY]
  oldRegimeSlabsByAge: {
    under60: [
      [250000, 0],
      [500000, 0.05],
      [1000000, 0.20],
      [Infinity, 0.30],
    ], // [VERIFY]
    senior: [ // 60–79
      [300000, 0],
      [500000, 0.05],
      [1000000, 0.20],
      [Infinity, 0.30],
    ], // [VERIFY]
    superSenior: [ // 80+
      [500000, 0],
      [1000000, 0.20],
      [Infinity, 0.30],
    ], // [VERIFY]
  },

  cessRate: 0.04, // [VERIFY] Health & Education Cess, applied after rebate

  // Section 87A rebate: new regime ⇒ full rebate up to ₹12L taxable income (~₹60,000 cap)
  // old regime ⇒ full rebate up to ₹5L taxable income (~₹12,500 cap)
  rebateThreshold: { new: 1200000, old: 500000 }, // [VERIFY]

  // Section caps (Old Regime only — New Regime disallows almost all of these)
  sectionCaps: {
    s123: { cap: 150000, newLabel: "Section 123", oldLabel: "80C" }, // [VERIFY]
    s124: { cap: 50000, newLabel: "Section 124", oldLabel: "80CCD(1B)" }, // [VERIFY]
    // Section 126 (80D) is two independent caps, not one combined figure:
    // self & family has its own under-60/senior tier, parents have their own
    // — a senior parent doesn't raise the self & family cap or vice versa.
    s126Self: { capUnder60: 25000, capSenior: 50000, newLabel: "Section 126", oldLabel: "80D", gloss: "self & family" }, // [VERIFY]
    s126Parents: { capUnder60: 25000, capSenior: 50000, newLabel: "Section 126", oldLabel: "80D", gloss: "parents" }, // [VERIFY]
    s22: { cap: 200000, newLabel: "Section 22", oldLabel: "24(b)" }, // [VERIFY]
  },

  // Cash-payment restrictions — a deduction otherwise within cap is disallowed
  // if paid in cash, with one exception. [VERIFY] cleartax.in/s/section-126-income-tax-act-2025; eztax.in
  cashRules: {
    s126PreventiveCheckupCashCap: 5000, // the one 126 (80D) item cash is still allowed for, inside the self/family cap
    s133CashDonationLimit: 2000, // Section 133 (80G) donations paid in cash above this are not deductible
  },

  // New + old form names/numbers, for UI copy that needs to show both. [VERIFY] cleartax.in; themunim.com
  formNumberMap: {
    "Form 16": "Form 130",
    "Form 26AS": "Form 168",
    "Form 12BB": "Form 124",
    "Form 26QC": "Form 141 Sch A",
  },

  standardDeduction: { old: 50000, new: 75000 }, // [VERIFY] salaried/pensioner only, both regimes

  // HRA exemption: min(HRA received, rent paid − hraRentOffsetPct of basic,
  // hraCityPct of basic). We don't collect "basic salary" in onboarding, so
  // hraAssumedBasicPct approximates basic as a share of gross income, and
  // hraReceivedApproxPct stands in for "HRA component received".
  hraHighExemptionCities: [
    "mumbai", "delhi", "kolkata", "chennai", // original 4 metros
    "bengaluru", "hyderabad", "ahmedabad", "pune", // expanded tier — VERIFY current list
  ], // [VERIFY: confirm current 8-city list before shipping] — default/alias of hraHighExemptionCitiesByFY["FY 2026–27"]

  // The 8-city 50% tier only applies from FY 2026-27 (IT Rules 2026, Schedule
  // III Sl.11). FY 2025-26 and earlier still use the original 4 metros.
  // [VERIFY] taxupdate.in
  hraHighExemptionCitiesByFY: {
    "FY 2025–26": ["mumbai", "delhi", "kolkata", "chennai"],
    "FY 2026–27": [
      "mumbai", "delhi", "kolkata", "chennai",
      "bengaluru", "hyderabad", "ahmedabad", "pune",
    ],
  },
  hraCityPct: { high: 0.5, low: 0.4 }, // [VERIFY]
  hraRentOffsetPct: 0.1, // [VERIFY] 10% of basic subtracted from rent paid
  hraAssumedBasicPct: 0.5, // [VERIFY / APPROXIMATION] basic salary ≈ 50% of gross
  hraReceivedApproxPct: 0.4, // [VERIFY / APPROXIMATION] stand-in for HRA component received

  // Task 4a: new regime is the default for every user (Section 202 of the
  // 2025 Act). We compare regimes silently and only surface a nudge toward
  // the old regime when it actually saves at least this much.
  oldRegimeNudgeThreshold: 5000, // [VERIFY] docs/NEXT_STEPS_2026-10.md task 4a

  // Income band midpoints, used as the working income estimate until the user
  // enters an exact figure.
  incomeBandMidpoint: {
    "Under ₹7L": 550000,
    "₹7L–₹12L": 950000,
    "₹12L–₹20L": 1600000,
    "Above ₹20L": 2500000,
  }, // [VERIFY]
  defaultIncomeFallback: 950000, // [VERIFY] used when no income band or exact income is set yet
};

// ---------- Category → Section mapping (drives the Review screen "Applies to" chip) ----------
const CATEGORY_MAP = {
  "PPF": { group: "s123", label: "Section 123 (80C) — PPF" },
  "ELSS / Mutual Fund": { group: "s123", label: "Section 123 (80C) — ELSS Investment" },
  "Life Insurance Premium": { group: "s123", label: "Section 123 (80C) — Life Insurance" },
  "EPF Voluntary Contribution": { group: "s123", label: "Section 123 (80C) — EPF" },
  "Home Loan Principal": { group: "s123", label: "Section 123 (80C) — Home Loan Principal" },
  "Tuition Fees": { group: "s123", label: "Section 123 (80C) — Tuition Fees" },
  "Sukanya Samriddhi": { group: "s123", label: "Section 123 (80C) — Sukanya Samriddhi" },
  "NSC": { group: "s123", label: "Section 123 (80C) — NSC" },
  "NPS Tier I Contribution": { group: "s124", label: "Section 124 (80CCD(1B)) — NPS Tier I" },
  "Health Insurance — Self/Family": { group: "s126self", label: "Section 126 (80D) — Health Insurance, Self/Family" },
  "Health Insurance — Parents": { group: "s126parents", label: "Section 126 (80D) — Health Insurance, Parents" },
  // Simplification: a preventive checkup counts inside the self & family
  // sub-limit in practice — not split out separately here. [VERIFY]
  "Preventive Health Checkup": { group: "s126self", label: "Section 126 (80D) — Preventive Checkup" },
  "Home Loan Interest": { group: "s22", label: "Section 22 (24b) — Home Loan Interest" },
  "Rent (for HRA)": { group: "hra", label: "HRA Exemption — Rent Paid" },
  "Donation": { group: "s133", label: "Section 133 (80G) — Donation" },
  "Education Loan Interest": { group: "edu", label: "Section [VERIFY] (80E) — Education Loan Interest" },
  "Disability / Dependant Care": { group: "s127", label: "Section 127 (80DD) — Disability/Dependant Care" },
  "Not tax-related / Skip this receipt": { group: "skip", label: null },
};

// ============================================================
// Demo / mock data — NOT tax figures, just prototype sample values for the
// Quick Confirm and receipt-extraction demo flows. Safe to edit freely.
// ============================================================
const DEMO_DETECTED_SEED = [
  { id: "d1", source: "UPI debit alert · 14 Aug", vendor: "Apollo Health Insurance", amount: 18000, category: "Health Insurance — Self/Family", meta: "Matched to a known health insurer", needsSplit: false },
  { id: "d2", source: "Bank debit alert · 5 Aug", vendor: "PPF — SBI Autopay", amount: 12500, category: "PPF", meta: "Recurring — matched last month too", needsSplit: false },
  { id: "d3", source: "Bank debit alert · 3 Aug", vendor: "HDFC Home Loan EMI", amount: 32400, category: null, meta: "Principal + interest — we'll split this", needsSplit: true },
];

const DEMO_MOCK_EXTRACTIONS = [
  { vendor: "LIC of India", amount: 24000, category: "Life Insurance Premium", lowConfidence: [] },
  { vendor: "HDFC ELSS Tax Saver Fund", amount: 15000, category: "ELSS / Mutual Fund", lowConfidence: ["amount"] },
  { vendor: "Star Health Insurance", amount: 9500, category: "Health Insurance — Parents", lowConfidence: [] },
  { vendor: "NPS Trust", amount: 5000, category: "NPS Tier I Contribution", lowConfidence: [] },
  { vendor: "Landlord — R. Sharma", amount: 22000, category: "Rent (for HRA)", lowConfidence: ["amount", "vendor"] },
  { vendor: "Akshaya Patra Foundation", amount: 2000, category: "Donation", lowConfidence: [] },
];

// ---------- Core slab calculator ----------
function taxFromSlabs(taxableIncome, slabs) {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lastCeiling = 0;
  for (const [ceiling, rate] of slabs) {
    if (taxableIncome > lastCeiling) {
      const slabAmount = Math.min(taxableIncome, ceiling) - lastCeiling;
      tax += slabAmount * rate;
    }
    lastCeiling = ceiling;
  }
  return tax;
}

function applyRebateAndCess(tax, taxableIncome, regime) {
  const rebateThreshold = regime === "new" ? TAX_CONFIG.rebateThreshold.new : TAX_CONFIG.rebateThreshold.old;
  let netTax;
  if (taxableIncome <= rebateThreshold) {
    netTax = 0;
  } else {
    // Marginal relief [VERIFY]: without it, crossing the rebate threshold by
    // even ₹1 used to jump tax from ₹0 to the full slab tax on the whole
    // income (a cliff edge). The relief caps tax payable at the amount by
    // which taxable income exceeds the threshold, so the extra tax never
    // outweighs the extra income that pushed you over.
    const marginalRelief = taxableIncome - rebateThreshold;
    netTax = Math.min(tax, marginalRelief);
  }
  const cess = netTax * TAX_CONFIG.cessRate;
  return Math.round(netTax + cess);
}

/**
 * Section 126 (80D) effective caps — self & family and parents are two
 * independent caps, each keyed only to that group's own age.
 */
function getSection126SelfCap({ selfSenior = false } = {}) {
  const s = TAX_CONFIG.sectionCaps.s126Self;
  return selfSenior ? s.capSenior : s.capUnder60;
}
function getSection126ParentsCap({ parentsSenior = false } = {}) {
  const s = TAX_CONFIG.sectionCaps.s126Parents;
  return parentsSenior ? s.capSenior : s.capUnder60;
}

/**
 * Old regime slab table for the taxpayer's own age band — seniors (60-79) and
 * super seniors (80+) get a higher nil band (see TAX_CONFIG.oldRegimeSlabsByAge).
 */
function getOldRegimeSlabs({ ageBand = "under60" } = {}) {
  return TAX_CONFIG.oldRegimeSlabsByAge[ageBand] || TAX_CONFIG.oldRegimeSlabsByAge.under60;
}

/**
 * Which HRA city tier (high/low %) a city falls into for a given FY — the
 * 8-city tier only exists from FY 2026-27; earlier years use the 4 metros.
 */
function getHRACityTier({ fyLabel = TAX_CONFIG.fyLabel, city } = {}) {
  const cityKey = (city || "").trim().toLowerCase();
  const cityList = TAX_CONFIG.hraHighExemptionCitiesByFY[fyLabel] || TAX_CONFIG.hraHighExemptionCities;
  return cityList.includes(cityKey) ? "high" : "low";
}

/**
 * Section 126 (80D): cash payments are disallowed except the preventive
 * health checkup line, which still gets the deduction (inside the self/family
 * cap) when paid in cash.
 */
function isSection126CashDisallowed({ category, paymentMode } = {}) {
  if (paymentMode !== "cash") return false;
  return category !== "Preventive Health Checkup";
}

/**
 * Section 133 (80G): cash donations above the statutory limit are not
 * deductible at all.
 */
function isSection133CashDisallowed({ paymentMode, amount = 0 } = {}) {
  if (paymentMode !== "cash") return false;
  return amount > TAX_CONFIG.cashRules.s133CashDonationLimit;
}

/**
 * Post-extraction / pre-save rule checks (docs/NEXT_STEPS_2026-10.md, task 5).
 * Informational only — per CLAUDE.md this app never blocks a save, it just
 * flags. Returns an array of warning codes (not display strings); app.js
 * maps each to a translated message, the same convention the glossary uses
 * for term keys.
 */
function checkReceiptRules(draft, existingReceipts) {
  const warnings = [];
  const date = draft && draft.date;
  const amount = Number(draft && draft.amount) || 0;

  if (date && (date < TAX_CONFIG.fyStart || date > TAX_CONFIG.fyEnd)) {
    warnings.push("dateOutsideFY");
  }

  if (Array.isArray(existingReceipts) && draft && draft.vendor && date && amount) {
    const vendorKey = draft.vendor.trim().toLowerCase();
    const isDuplicate = existingReceipts.some(
      (r) => r.vendor.trim().toLowerCase() === vendorKey && r.date === date && Number(r.amount) === amount
    );
    if (isDuplicate) warnings.push("duplicate");
  }

  if (draft && isSection126CashDisallowed(draft)) warnings.push("cash126Disallowed");
  if (draft && isSection133CashDisallowed(draft)) warnings.push("cash133OverLimit");

  return warnings;
}

/**
 * Simplified HRA exemption estimate.
 * Real formula: min(HRA actually received, rent paid − 10% of basic salary,
 * 50% of basic salary in the 8 metro-tier cities / 40% elsewhere).
 * We don't collect a separate "basic salary" figure in onboarding (just gross
 * income), so we approximate basic salary as a share of gross — a common rule
 * of thumb, but flagged clearly since it will differ from real payslips.
 */
function estimateHRAExemption({ rentPaidAnnual, grossIncome, city, fyLabel = TAX_CONFIG.fyLabel }) {
  if (!rentPaidAnnual || rentPaidAnnual <= 0) return 0;
  const assumedBasic = grossIncome * TAX_CONFIG.hraAssumedBasicPct;
  const tier = getHRACityTier({ fyLabel, city });
  const cityPct = tier === "high" ? TAX_CONFIG.hraCityPct.high : TAX_CONFIG.hraCityPct.low;

  const byRentMinus10pct = Math.max(0, rentPaidAnnual - assumedBasic * TAX_CONFIG.hraRentOffsetPct);
  const byCityPct = assumedBasic * cityPct;
  const byActualHRA = assumedBasic * TAX_CONFIG.hraReceivedApproxPct;

  return Math.max(0, Math.round(Math.min(byRentMinus10pct, byCityPct, byActualHRA)));
}

/**
 * Compute deduction totals per section from a receipts array, capped.
 */
function summarizeDeductions(receipts, { section126SelfCap = getSection126SelfCap(), section126ParentsCap = getSection126ParentsCap() } = {}) {
  const raw = { s123: 0, s124: 0, s126self: 0, s126parents: 0, s22: 0, s133: 0, edu: 0, s127: 0, hra: 0 };
  for (const r of receipts) {
    const mapped = CATEGORY_MAP[r.category];
    if (!mapped || mapped.group === "skip") continue;
    // Cash-rule disallowance: receipts carry no paymentMode today (undefined
    // never equals "cash"), so this is a no-op until that field exists.
    if ((mapped.group === "s126self" || mapped.group === "s126parents") && isSection126CashDisallowed(r)) continue;
    if (mapped.group === "s133" && isSection133CashDisallowed(r)) continue;
    raw[mapped.group] = (raw[mapped.group] || 0) + Number(r.amount || 0);
  }
  const capped = {
    s123: Math.min(raw.s123, TAX_CONFIG.sectionCaps.s123.cap),
    s124: Math.min(raw.s124, TAX_CONFIG.sectionCaps.s124.cap),
    s126self: Math.min(raw.s126self, section126SelfCap),
    s126parents: Math.min(raw.s126parents, section126ParentsCap),
    s22: Math.min(raw.s22, TAX_CONFIG.sectionCaps.s22.cap),
    s133: raw.s133, // 50%/100% eligibility varies by fund — not capped here, flagged in UI
    edu: raw.edu, // no cap on education loan interest [VERIFY]
    s127: raw.s127, // fixed-amount deduction in reality, not amount-based — simplified here
  };
  return { raw, capped };
}

/**
 * Full regime comparison given gross income + logged receipts + onboarding context.
 */
function compareRegimes({ grossIncome, receipts, hraContext = {}, section126Options = {}, ageBand = "under60" }) {
  const section126SelfCap = getSection126SelfCap(section126Options);
  const section126ParentsCap = getSection126ParentsCap(section126Options);
  const { capped } = summarizeDeductions(receipts, { section126SelfCap, section126ParentsCap });
  // hraContext.exemptOverride lets a caller that already has a computed HRA
  // exemption (and no rent/city to recompute it from — e.g. the CA workspace's
  // per-client sample data) pass it straight through instead of recomputing.
  const hraExempt = typeof hraContext.exemptOverride === "number"
    ? hraContext.exemptOverride
    : estimateHRAExemption({
        rentPaidAnnual: hraContext.rentPaidAnnual || 0,
        grossIncome,
        city: hraContext.city,
        fyLabel: hraContext.fyLabel,
      });

  const oldDeductionsTotal =
    TAX_CONFIG.standardDeduction.old + capped.s123 + capped.s124 + capped.s126self + capped.s126parents + capped.s22 + hraExempt;
  const oldTaxable = Math.max(0, grossIncome - oldDeductionsTotal);
  const oldTax = applyRebateAndCess(taxFromSlabs(oldTaxable, getOldRegimeSlabs({ ageBand })), oldTaxable, "old");

  const newTaxable = Math.max(0, grossIncome - TAX_CONFIG.standardDeduction.new);
  const newTax = applyRebateAndCess(taxFromSlabs(newTaxable, TAX_CONFIG.newRegimeSlabs), newTaxable, "new");

  return {
    oldTax,
    newTax,
    betterRegime: oldTax <= newTax ? "old" : "new",
    savingsIfBetter: Math.abs(oldTax - newTax),
    deductionsUsed: capped,
    hraExempt,
    oldTaxable,
    newTaxable,
  };
}

const TaxEngineExports = {
  TAX_CONFIG,
  // Flat aliases kept for callers that reference individual figures directly.
  FY_LABEL: TAX_CONFIG.fyLabel,
  FY_START: TAX_CONFIG.fyStart,
  FY_END: TAX_CONFIG.fyEnd,
  DEADLINES: TAX_CONFIG.deadlines,
  NEW_REGIME_SLABS: TAX_CONFIG.newRegimeSlabs,
  OLD_REGIME_SLABS: TAX_CONFIG.oldRegimeSlabs,
  SECTION_CAPS: TAX_CONFIG.sectionCaps,
  STANDARD_DEDUCTION: TAX_CONFIG.standardDeduction,
  REBATE_THRESHOLD: TAX_CONFIG.rebateThreshold,
  OLD_REGIME_NUDGE_THRESHOLD: TAX_CONFIG.oldRegimeNudgeThreshold,
  HRA_HIGH_EXEMPTION_CITIES: TAX_CONFIG.hraHighExemptionCities,
  INCOME_BAND_MIDPOINT: TAX_CONFIG.incomeBandMidpoint,
  DEFAULT_INCOME_FALLBACK: TAX_CONFIG.defaultIncomeFallback,
  CATEGORY_MAP,
  DEMO_DETECTED_SEED,
  DEMO_MOCK_EXTRACTIONS,
  taxFromSlabs,
  applyRebateAndCess,
  getSection126SelfCap,
  getSection126ParentsCap,
  getOldRegimeSlabs,
  getHRACityTier,
  isSection126CashDisallowed,
  isSection133CashDisallowed,
  checkReceiptRules,
  estimateHRAExemption,
  summarizeDeductions,
  compareRegimes,
};

if (typeof module !== "undefined") {
  module.exports = TaxEngineExports;
}
if (typeof window !== "undefined") {
  window.TaxEngine = TaxEngineExports;
}

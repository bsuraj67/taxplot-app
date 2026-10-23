/**
 * TaxPlot — App logic
 * Vanilla JS, no build step. Wired to tax-engine.js for all deduction/regime math.
 *
 * Screens: s-onboarding (profile quiz — new tax regime is the default, no
 * regime question asked) -> s-permission (auto-detect opt-in) ->
 * s-app (main shell: Overview / Receipts / Report / Settings, sidebar on
 * desktop + tabbar on phones). s-camera, s-review and s-quickconfirm are
 * full-screen takeovers reachable from inside the app shell.
 *
 * Two kinds of state:
 * - SETTINGS: appearance + display preferences, persisted to localStorage
 *   (theme, text size, density, motion, hide amounts, number format,
 *   section-number order, reminders). Applied before first paint by the
 *   inline script in index.html's <head>.
 * - STATE: receipts, onboarding answers, regime choice, camera/review —
 *   in-memory only, resets on reload by design (no backend yet).
 */

// ---------- Settings (persisted) ----------
const SETTINGS_KEY = "taxplot.settings";
// var (not const) so smoke-test.js can reach it as window.SETTINGS_DEFAULTS,
// same reason as t/LOCALE/STATE/SETTINGS below.
var SETTINGS_DEFAULTS = {
  theme: "auto",          // auto | light | dark
  text: "default",        // default | large
  density: "comfortable", // comfortable | compact
  motion: "system",       // system | reduce
  hideAmounts: false,     // blur ₹ figures until hovered/focused
  numFormat: "lakh",      // lakh (₹1,50,000) | intl (₹150,000)
  sectionOrder: "new",    // new: "Section 123 (80C)" | old: "80C (Section 123)"
  remindMonthly: true,
  remindDeadline: true,
  deadlineDays: 45,
  quietHours: true,
  postFiling: { eVerified: false, refundReceived: false }, // task 7 post-filing tracker
};
var SETTINGS = Object.assign({}, SETTINGS_DEFAULTS, (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (e) { return {}; }
})());
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) {} }
function applyAppearance() {
  const r = document.documentElement;
  if (SETTINGS.theme === "auto") delete r.dataset.theme; else r.dataset.theme = SETTINGS.theme;
  SETTINGS.text === "large" ? (r.dataset.text = "large") : delete r.dataset.text;
  SETTINGS.density === "compact" ? (r.dataset.density = "compact") : delete r.dataset.density;
  SETTINGS.motion === "reduce" ? (r.dataset.motion = "reduce") : delete r.dataset.motion;
  SETTINGS.hideAmounts ? (r.dataset.hide = "1") : delete r.dataset.hide;
}

// ---------- i18n (prep only — not translated yet, see locales/en.json) ----------
// loadLocale/makeT come from locales/i18n.js, loaded before this file.
// var (not const) so t/LOCALE land on window, same as STATE/SETTINGS below —
// smoke-test.js reaches them that way across separate script evaluations.
var LOCALE = loadLocale("locales/en.json");
var t = makeT(LOCALE.app || {});
// "Tax words" glossary (task 4b) -- English only for now, see the _meta note
// in the file itself for why Hindi isn't here yet.
var GLOSSARY = loadLocale("locales/glossary.en.json");

// ---------- Constants ----------
const FY_LABEL = TaxEngine.FY_LABEL;
const FY_END = new Date(TaxEngine.FY_END + "T23:59:59");
const FY_START = new Date(TaxEngine.FY_START);

const EMPLOYMENT_OPTIONS = ["Salaried", "Freelance / Gig work", "Business owner", "Mix of these"];
const INCOME_BAND_OPTIONS = Object.keys(TaxEngine.INCOME_BAND_MIDPOINT);
const COMMITMENT_OPTIONS = [
  "Home loan (EMI running)",
  "Health insurance premium (self/family)",
  "PPF / EPF / ELSS investments",
  "Life insurance premium",
  "Rent — and I get HRA in my salary",
  "Rent — but no HRA (freelancer/no HRA component)",
  "None of these yet",
];
const CITY_SUGGESTIONS = [
  "Mumbai", "Delhi", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Ahmedabad", "Pune",
  "Jaipur", "Lucknow", "Surat", "Nagpur", "Chandigarh", "Kochi",
];

const CATEGORY_GROUPS = [
  {
    label: "Investments — Section 123 (80C)",
    options: ["PPF", "ELSS / Mutual Fund", "Life Insurance Premium", "EPF Voluntary Contribution", "Home Loan Principal", "Tuition Fees", "Sukanya Samriddhi", "NSC"],
  },
  { label: "Retirement — Section 124 (80CCD(1B))", options: ["NPS Tier I Contribution"] },
  { label: "Health — Section 126 (80D)", options: ["Health Insurance — Self/Family", "Health Insurance — Parents", "Preventive Health Checkup"] },
  { label: "Housing", options: ["Home Loan Interest", "Rent (for HRA)"] },
  { label: "Donations — Section 133 (80G)", options: ["Donation"] },
  { label: "Education", options: ["Education Loan Interest"] },
  { label: "Medical", options: ["Disability / Dependant Care"] },
  { label: "", options: ["Not tax-related / Skip this receipt"] },
];

// Mock "detected payment" seed data and mock receipt-extraction pool live in
// tax-engine.js (TaxEngine.DEMO_DETECTED_SEED / TaxEngine.DEMO_MOCK_EXTRACTIONS)
// so app.js never hardcodes a rupee amount.
// TODO(backend): replace the mock extraction pool with a real POST to your
// extraction endpoint once the backend exists (see knowledge base §3).

// ---------- State (in-memory, resets on reload by design) ----------
function freshOnboarding() {
  return {
    step: 1,
    employment: null,
    incomeBand: null,
    commitments: [],
    city: "",
    section126: { selfSenior: false, parentsSenior: false },
    completed: false,
  };
}

var STATE = {
  screen: "s-onboarding",
  appView: "overview", // overview | receipts | report | settings
  onboarding: freshOnboarding(),
  regime: null, // 'old' | 'new' | 'compare'
  income: null, // exact annual income, defaults to band midpoint
  autoDetectEnabled: false,
  receipts: [],
  pendingDetected: [],
  receiptFilter: "all",
  reviewDraft: null,
  reviewDraftSource: null, // 'camera' | 'manual' | 'detected'
  camera: { phase: "idle", photo: null }, // idle | freeze | loading | fallback
  confirmDelete: false,
  confirmRegimeOptOut: false, // false, or the regime value pending a freelancer/business opt-out confirmation (task 4a)
  glossaryOpen: null, // term key, while its bottom sheet is open (task 4b)
  glossaryQuery: "",
  familyMembers: [], // { id, name, relation: "Parent" | "Child" } -- task 7 family profiles
  toast: null,
};

function daysLeftInFY() {
  const now = new Date();
  const diff = Math.ceil((FY_END - now) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 0);
}
function fyPct() {
  const now = new Date();
  return Math.min(1, Math.max(0, (now - FY_START) / (FY_END - FY_START)));
}

// fmtINR respects the Money & numbers > Number format setting (lakh vs
// international grouping). fmtRs (used only by the PDF export) always uses
// en-IN grouping since it's a fixed, shareable document.
function fmtINR(n) {
  const v = Math.round(Number(n) || 0);
  return "₹" + v.toLocaleString(SETTINGS.numFormat === "intl" ? "en-US" : "en-IN");
}
function inr(n) { return `<span class="money num" tabindex="0">${fmtINR(n)}</span>`; }

// jsPDF's built-in fonts have no ₹ glyph (renders as a broken box) and we don't
// ship a Unicode font to embed, so PDF text uses "Rs." instead — see PDF export below.
function fmtRs(n) {
  const v = Math.round(Number(n) || 0);
  return "Rs. " + v.toLocaleString("en-IN");
}

const OLD_SEC_NO = { "123": "80C", "124": "80CCD(1B)", "126": "80D", "22": "24(b)", "133": "80G" };
function secLabel(num, old) {
  old = old || OLD_SEC_NO[num];
  return SETTINGS.sectionOrder === "old" ? `${old} (Section ${num})` : `Section ${num} (${old})`;
}
function fmtD(d) { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); }

function el(id) { return document.getElementById(id); }

function showToast(msg) {
  STATE.toast = msg;
  renderToast();
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { STATE.toast = null; renderToast(); }, 2200);
}
function renderToast() {
  const toastEl = el("toast");
  if (!toastEl) return;
  toastEl.textContent = STATE.toast || "";
  toastEl.classList.toggle("show", !!STATE.toast);
}

function currentIncome() {
  if (STATE.income) return STATE.income;
  const band = STATE.onboarding.incomeBand;
  return band ? TaxEngine.INCOME_BAND_MIDPOINT[band] : TaxEngine.DEFAULT_INCOME_FALLBACK;
}
function rentPaidAnnual() {
  return STATE.receipts.filter((r) => r.category === "Rent (for HRA)").reduce((sum, r) => sum + Number(r.amount || 0), 0);
}
function hasHRA() {
  return STATE.onboarding.commitments.includes("Rent — and I get HRA in my salary");
}
function hasHomeLoan() {
  return STATE.onboarding.commitments.includes("Home loan (EMI running)") ||
    STATE.receipts.some((r) => r.category === "Home Loan Interest" || r.category === "Home Loan Principal");
}
// Task 4a: freelancers/business owners can switch back to the new regime
// only once, so they get a confirmation before opting out of the default.
function isFreelancerOrBusiness() {
  return STATE.onboarding.employment === "Freelance / Gig work" || STATE.onboarding.employment === "Business owner";
}
function getComparison() {
  return TaxEngine.compareRegimes({
    grossIncome: currentIncome(),
    receipts: STATE.receipts,
    hraContext: { rentPaidAnnual: rentPaidAnnual(), city: STATE.onboarding.city },
    section126Options: STATE.onboarding.section126,
  });
}
// Caps/deductions only exist under the Old Regime. "compare" shows both
// numbers but still tracks caps the old-regime way underneath.
function effectiveRegime() { return STATE.regime === "new" ? "new" : "old"; }
function computeSavedVsNoDeductions() {
  const income = currentIncome();
  const zeroDeductionCmp = TaxEngine.compareRegimes({ grossIncome: income, receipts: [], hraContext: {}, section126Options: {} });
  const baselineTax = effectiveRegime() === "new" ? zeroDeductionCmp.newTax : zeroDeductionCmp.oldTax;
  const currentTax = effectiveRegime() === "new" ? getComparison().newTax : getComparison().oldTax;
  return Math.max(0, baselineTax - currentTax);
}
function receiptsForGroup(group) {
  return STATE.receipts.filter((r) => { const m = TaxEngine.CATEGORY_MAP[r.category]; return m && m.group === group; });
}

// ---------- Icons (subset of the Peacock icon set) ----------
const ICON_PATHS = {
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.9v.2"/>',
  dash: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.9 3.5M6.3 7.6C3.9 9.3 2.5 12 2.5 12S6 18.5 12 18.5a8.6 8.6 0 0 0 4-1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  report: '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  camera: '<path d="M3.5 8h3.2L8.5 5.5h7L17.3 8h3.2v11h-17z"/><circle cx="12" cy="13.3" r="3.6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  scale: '<path d="M12 4v16M6 20h12M4 8h16"/><path d="M6.5 8 4 14h5zM17.5 8 15 14h5z"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
};
function ic(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`; }
const STATUS = {
  done: [t("status.done"), "check", "st-done"],
  room: [t("status.room"), "clock", "st-room"],
  soon: [t("status.soon"), "alert", "st-soon"],
  none: [t("status.none"), "dash", "st-none"],
  check: [t("status.check"), "eye", "st-check"],
};
function chip(key, text) { return `<span class="chip ${STATUS[key][2]}">${ic(STATUS[key][1])}${text || STATUS[key][0]}</span>`; }
function status(used, cap) {
  if (cap <= 0) return "none";
  if (used >= cap) return "done";
  if (used === 0) return "none";
  return daysLeftInFY() <= SETTINGS.deadlineDays ? "soon" : "room";
}
function meter(used, cap, st, segs) {
  if (st === "none") return `<div class="meter none" role="img" aria-label="Nothing logged"></div>`;
  return `<div class="meter ${st}" role="img" aria-label="${fmtINR(used)} of ${fmtINR(cap)} used">${(segs || [used]).map((a) => `<i style="width:${Math.min(100, (a / cap) * 100)}%"></i>`).join("")}</div>`;
}
function escAttr(s) { return String(s).replace(/"/g, "&quot;"); }
const DISC = `<p class="disc">${ic("info")}${t("common.disclaimer")}</p>`;

// ============================================================
// Top-level screen switching
// ============================================================
const TOP_SCREENS = ["s-onboarding", "s-permission", "s-quickconfirm", "s-camera", "s-review", "s-app"];
function show(screenId) {
  STATE.screen = screenId;
  TOP_SCREENS.forEach((id) => { el(id).hidden = id !== screenId; });
  renderCurrentScreen();
  window.scrollTo(0, 0);
}
function showApp(view) {
  STATE.appView = view;
  STATE.confirmDelete = false;
  show("s-app");
}
function renderCurrentScreen() {
  const map = {
    "s-onboarding": renderOnboarding,
    "s-permission": renderPermission,
    "s-quickconfirm": renderQuickConfirm,
    "s-camera": paintCamera,
    "s-review": renderReview,
    "s-app": renderApp,
  };
  (map[STATE.screen] || renderApp)();
}

// ============================================================
// SCREEN — Onboarding (profile quiz — no regime question; new regime is
// always the default, see task 4a)
// ============================================================
function renderOnboarding() {
  const ob = STATE.onboarding;
  const step = ob.step;
  const dots = [1, 2, 3, 4].map((n) => `<span class="${n < step ? "done" : ""}"></span>`).join("");

  let body = "";
  if (step === 1) {
    body = `
      <div class="q-eyebrow">${t("onboarding.progress", { n: 1 })}</div>
      <div class="q-title">${t("onboarding.q1Title")}</div>
      <div class="q-sub">${t("onboarding.q1Sub")}</div>
      ${EMPLOYMENT_OPTIONS.map((o) => optHTML(o, ob.employment === o, "set-employment")).join("")}
      ${navRow(false, true)}
    `;
  } else if (step === 2) {
    body = `
      <div class="q-eyebrow">${t("onboarding.progress", { n: 2 })}</div>
      <div class="q-title">${t("onboarding.q2Title")}</div>
      <div class="q-sub">${t("onboarding.q2Sub")}</div>
      ${INCOME_BAND_OPTIONS.map((o) => optHTML(o, ob.incomeBand === o, "set-income-band")).join("")}
      ${navRow(true, true)}
    `;
  } else if (step === 3) {
    body = `
      <div class="q-eyebrow">${t("onboarding.progress", { n: 3 })}</div>
      <div class="q-title">${t("onboarding.q3Title")}</div>
      <div class="q-sub">${t("onboarding.q3Sub")}</div>
      ${COMMITMENT_OPTIONS.map(
        (o) => `<button type="button" class="opt ${ob.commitments.includes(o) ? "selected" : ""}" data-action="toggle-commitment" data-value="${escAttr(o)}" role="checkbox" aria-checked="${ob.commitments.includes(o)}">
          <div class="cb-opt"><div class="cb ${ob.commitments.includes(o) ? "on" : ""}" aria-hidden="true"></div>${o}</div>
        </button>`
      ).join("")}
      ${navRow(true, true)}
    `;
  } else if (step === 4 && hasHRA()) {
    body = `
      <div class="q-eyebrow">${t("onboarding.progress", { n: 4 })}</div>
      <div class="q-title">${t("onboarding.q4Title")}</div>
      <div class="q-sub">${t("onboarding.q4Sub")}</div>
      <input class="text-input" id="city-input" placeholder="${t("onboarding.q4Placeholder")}" value="${escAttr(ob.city)}" list="city-list" data-action="set-city" aria-label="${t("onboarding.q4Title")}" />
      <datalist id="city-list">${CITY_SUGGESTIONS.map((c) => `<option value="${c}">`).join("")}</datalist>
      ${navRow(true, true)}
    `;
  }

  el("s-onboarding").querySelector(".container").innerHTML = `<div class="progress-dots">${dots}</div>${body}`;
}
function optHTML(label, selected, action) {
  return `<button type="button" class="opt ${selected ? "selected" : ""}" data-action="${action}" data-value="${escAttr(label)}" aria-pressed="${selected}">${label}</button>`;
}
function navRow(showBack, showNext) {
  return `<div class="nav-row" style="margin-top:16px;">
    ${showBack ? `<button class="btn-secondary" style="margin-top:0;" data-action="ob-back">${t("common.back")}</button>` : ""}
    ${showNext ? `<button class="btn-primary" style="margin-top:0;" data-action="ob-next">${t("common.continueBtn")}</button>` : ""}
  </div>`;
}
function obNext() {
  const ob = STATE.onboarding;
  if (ob.step === 1 && !ob.employment) return showToast(t("onboarding.toastPickEmployment"));
  if (ob.step === 2 && !ob.incomeBand) return showToast(t("onboarding.toastPickIncome"));
  if (ob.step === 3 && ob.commitments.length === 0) return showToast(t("onboarding.toastPickCommitment"));
  if (ob.step === 4 && hasHRA() && !ob.city.trim()) return showToast(t("onboarding.toastEnterCity"));

  if (ob.step === 3 && !hasHRA()) return completeOnboarding();
  if (ob.step >= 4) return completeOnboarding();
  ob.step += 1;
  renderOnboarding();
}
function obBack() {
  const ob = STATE.onboarding;
  ob.step = Math.max(1, ob.step - 1);
  renderOnboarding();
}
// Task 4a: every user starts on the new tax regime (default) — no regime
// question in onboarding. We silently compare regimes from here on and only
// nudge toward the old regime later, on the Overview dashboard, when it
// actually saves enough to be worth mentioning (see renderOverviewView).
function completeOnboarding() {
  STATE.regime = "new";
  STATE.onboarding.completed = true;
  if (!STATE.income) STATE.income = currentIncome();
  show("s-permission");
}

// ============================================================
// SCREEN — Permission (auto-detect opt-in)
// ============================================================
function renderPermission() {
  el("s-permission").querySelector(".container").innerHTML = `
    <div class="perm-icon">🔍</div>
    <div class="perm-title">${t("permission.title")}</div>
    <div class="perm-sub">${t("permission.sub")}</div>

    <div class="perm-row">
      <div class="ic">💬</div>
      <div>
        <div class="t">${t("permission.row1Title")}</div>
        <div class="d">${t("permission.row1Desc")}</div>
      </div>
    </div>
    <div class="perm-row">
      <div class="ic">🔔</div>
      <div>
        <div class="t">${t("permission.row2Title")}</div>
        <div class="d">${t("permission.row2Desc")}</div>
      </div>
    </div>

    <button class="btn-primary" data-action="enable-autodetect">${t("permission.enableBtn")}</button>
    <button type="button" class="perm-skip" data-action="skip-autodetect">${t("permission.skipLink")}</button>

    <div class="perm-note">${t("permission.note")}</div>
  `;
}
function enableAutoDetect() {
  STATE.autoDetectEnabled = true;
  STATE.pendingDetected = TaxEngine.DEMO_DETECTED_SEED.map((d) => ({ ...d }));
  enterAppOrSharedReceipt();
}
function skipAutoDetect() {
  STATE.autoDetectEnabled = false;
  STATE.pendingDetected = [];
  enterAppOrSharedReceipt();
}
// A photo shared in from outside the app (task 6) takes priority over
// landing on Overview -- it's why the user opened TaxPlot just now.
function enterAppOrSharedReceipt() {
  if (PENDING_SHARED_PHOTO) {
    STATE.camera = { phase: "freeze", photo: PENDING_SHARED_PHOTO };
    PENDING_SHARED_PHOTO = null;
    show("s-camera");
    return;
  }
  showApp("overview");
}

// ============================================================
// SCREEN — Quick Confirm (review detected payments)
// ============================================================
function renderQuickConfirm() {
  const items = STATE.pendingDetected;
  const c = el("s-quickconfirm").querySelector(".container");
  if (items.length === 0) {
    c.innerHTML = `
      <div class="qc-head"><h2>${t("quickconfirm.emptyTitle")}</h2><p>${t("quickconfirm.emptySub")}</p></div>
      <div class="empty-note" style="margin-top:16px;">${t("quickconfirm.emptyNote")}</div>
      <button class="btn-primary" data-action="goto-overview">${t("quickconfirm.backToOverview")}</button>
    `;
    return;
  }
  c.innerHTML = `
    <div class="qc-head"><h2>${t("quickconfirm.header")}</h2><p>${t("quickconfirm.sub")}</p></div>
    <div class="qc-stack-note">${t("quickconfirm.stackNote", { n: items.length })}</div>
    ${items.map((d) => qcCardHTML(d)).join("")}
    <button type="button" class="btn-ghost" style="border:1px dashed var(--line); border-radius:12px; margin-top:6px;" data-action="goto-camera">${t("quickconfirm.addManually")}</button>
    <div style="height:16px"></div>
  `;
}
function qcCardHTML(d) {
  const mapped = d.category ? TaxEngine.CATEGORY_MAP[d.category] : null;
  const guess = d.needsSplit
    ? `<div class="qc-guess" style="background:var(--surf2); color:var(--mute);">${t("quickconfirm.needsSplit")}</div>`
    : mapped ? `<div class="qc-guess">${t("quickconfirm.guessPrefix", { label: mapped.label })}</div>` : "";
  const actions = d.needsSplit
    ? `<div class="qc-actions">
        <button class="qc-btn no" data-action="qc-dismiss" data-id="${d.id}">${t("quickconfirm.notThis")}</button>
        <button class="qc-btn yes" data-action="qc-split" data-id="${d.id}">${t("quickconfirm.splitReview")}</button>
      </div>`
    : `<div class="qc-actions">
        <button class="qc-btn no" data-action="qc-dismiss" data-id="${d.id}">${t("quickconfirm.notThis")}</button>
        <button class="qc-btn edit" data-action="qc-edit" data-id="${d.id}" aria-label="${t("quickconfirm.editAria")}">✎</button>
        <button class="qc-btn yes" data-action="qc-confirm" data-id="${d.id}">${t("quickconfirm.yesCount")}</button>
      </div>`;
  return `
    <div class="qc-card">
      <div class="qc-source"><span class="dot"></span>${d.source}</div>
      <div class="qc-vendor">${d.vendor}</div>
      <div class="qc-amt">${fmtINR(d.amount)}</div>
      <div class="qc-meta">${d.meta}</div>
      ${guess}
      ${actions}
    </div>`;
}
function qcDismiss(id) {
  STATE.pendingDetected = STATE.pendingDetected.filter((d) => d.id !== id);
  showToast(t("quickconfirm.dismissedToast"));
  renderQuickConfirm();
}
function qcConfirm(id) {
  const d = STATE.pendingDetected.find((x) => x.id === id);
  if (!d) return;
  STATE.receipts.push({
    id: "r" + Date.now(), vendor: d.vendor, date: new Date().toISOString().slice(0, 10),
    amount: d.amount, category: d.category, notes: "", photo: null, lowConfidence: [], source: "detected",
  });
  STATE.pendingDetected = STATE.pendingDetected.filter((x) => x.id !== id);
  const mapped = TaxEngine.CATEGORY_MAP[d.category];
  showToast(t("quickconfirm.savedTowardToast", { label: mapped ? mapped.label.split(" — ")[0] : t("quickconfirm.savedTowardFallback") }));
  renderQuickConfirm();
}
function qcEditOrSplit(id) {
  const d = STATE.pendingDetected.find((x) => x.id === id);
  if (!d) return;
  STATE.reviewDraft = { vendor: d.vendor, date: new Date().toISOString().slice(0, 10), amount: d.amount, category: d.category || "", notes: "", photo: null, lowConfidence: [], landlordPan: "", landlordRelationship: "", familyMember: "", paymentMode: "" };
  STATE.reviewDraftSource = "detected";
  STATE.pendingDetected = STATE.pendingDetected.filter((x) => x.id !== id);
  show("s-review");
}

// ============================================================
// SCREEN — Camera
// ============================================================
function gotoCamera() {
  STATE.camera = { phase: "idle", photo: null };
  show("s-camera");
}
function paintCamera() {
  const cam = STATE.camera;
  const view = el("s-camera").querySelector(".cam-view");
  if (cam.phase === "idle") {
    view.innerHTML = `
      <button class="back-arrow" data-action="goto-overview" aria-label="${t("nav.overview")}">←</button>
      <div class="flash">⚡</div>
      <div class="cam-overlay-text">${t("camera.overlayText")}</div>
      <div class="receipt-outline">${t("camera.outlineHint")}</div>
      <input type="file" accept="image/*" capture="environment" id="camera-input" class="visually-hidden" data-action="file-selected" />
      <input type="file" accept="image/*" id="gallery-input" class="visually-hidden" data-action="file-selected" />
      <div class="cam-controls">
        <button class="cam-icon" data-action="open-gallery" title="${t("camera.galleryTitle")}">🖼️</button>
        <button class="shutter" data-action="open-camera" title="${t("camera.shutterTitle")}"></button>
        <div style="width:44px;"></div>
      </div>
    `;
  } else if (cam.phase === "freeze") {
    view.innerHTML = `
      <div class="freeze-frame">
        <img class="freeze-thumb" src="${cam.photo}" alt="Captured receipt" />
        <div class="freeze-actions">
          <button class="retake" data-action="retake-photo">${t("camera.retake")}</button>
          <button class="use" data-action="use-photo">${t("camera.usePhoto")}</button>
        </div>
      </div>`;
  } else if (cam.phase === "loading") {
    view.innerHTML = `
      <img class="freeze-thumb" src="${cam.photo}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.5; border-radius:0;" alt="" />
      <div class="loading-strip">${t("camera.loading")}</div>
    `;
  } else if (cam.phase === "fallback") {
    view.innerHTML = `
      <div class="cam-fallback">
        <div style="font-size:28px;">🤔</div>
        <div style="font-weight:700; font-size:16px;">${t("camera.fallbackTitle")}</div>
        <p>${t("camera.fallbackSub")}</p>
        <div class="row">
          <button class="retry" data-action="retake-photo">${t("camera.retake")}</button>
          <button class="manual" data-action="enter-manually">${t("camera.manual")}</button>
        </div>
      </div>`;
  }
}
function openCameraInput() { el("camera-input").click(); }
function openGalleryInput() { el("gallery-input").click(); }
function onFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { STATE.camera = { phase: "freeze", photo: e.target.result }; paintCamera(); };
  reader.readAsDataURL(file);
}
function retakePhoto() { STATE.camera = { phase: "idle", photo: null }; paintCamera(); }
function usePhoto() {
  STATE.camera.phase = "loading";
  paintCamera();
  setTimeout(() => {
    // Simulated extraction — see MOCK_EXTRACTIONS note above.
    const success = Math.random() > 0.05;
    if (!success) { STATE.camera.phase = "fallback"; paintCamera(); return; }
    const pick = TaxEngine.DEMO_MOCK_EXTRACTIONS[Math.floor(Math.random() * TaxEngine.DEMO_MOCK_EXTRACTIONS.length)];
    STATE.reviewDraft = { vendor: pick.vendor, date: new Date().toISOString().slice(0, 10), amount: pick.amount, category: pick.category, notes: "", photo: STATE.camera.photo, lowConfidence: pick.lowConfidence, landlordPan: "", landlordRelationship: "", familyMember: "", paymentMode: "" };
    STATE.reviewDraftSource = "camera";
    show("s-review");
  }, 1100);
}
function enterManually() {
  STATE.reviewDraft = { vendor: "", date: new Date().toISOString().slice(0, 10), amount: "", category: "", notes: "", photo: null, lowConfidence: [], landlordPan: "", landlordRelationship: "", familyMember: "", paymentMode: "" };
  STATE.reviewDraftSource = "manual";
  show("s-review");
}

// ============================================================
// SCREEN — Review
// ============================================================
function renderReview() {
  const d = STATE.reviewDraft;
  const c = el("s-review").querySelector(".container");
  if (!d) { showApp("overview"); return; }
  const mapped = d.category ? TaxEngine.CATEGORY_MAP[d.category] : null;
  const flag = (field) => (d.lowConfidence.includes(field) ? `<span class="flag">${t("review.flag")}</span>` : "");

  c.innerHTML = `
    <div class="review-head">
      <h2>${t("review.heading")}</h2>
      <p>${t("review.sub")}</p>
    </div>
    <div class="review-thumb">${d.photo ? `<img src="${d.photo}" alt="Receipt" />` : t("review.noPhoto")}</div>

    <div class="field">
      <label>${t("review.vendorLabel")}
      <input class="input" data-field="vendor" value="${escAttr(d.vendor)}" placeholder="${t("review.vendorPlaceholder")}" /></label>
      ${flag("vendor")}
    </div>
    <div class="field">
      <label>${t("review.dateLabel")}
      <input class="input" type="date" data-field="date" value="${d.date}" /></label>
    </div>
    <div class="field">
      <label>${t("review.amountLabel")}
      <input class="input amt" type="number" data-field="amount" value="${d.amount}" placeholder="0" /></label>
      ${flag("amount")}
    </div>
    <div class="field">
      <label>${t("review.categoryLabel")}
      <select class="input" data-field="category">
        <option value="" ${!d.category ? "selected" : ""} disabled>${t("review.categoryPlaceholder")}</option>
        ${CATEGORY_GROUPS.map((g) => g.label
          ? `<optgroup label="${g.label}">${g.options.map((o) => `<option value="${escAttr(o)}" ${d.category === o ? "selected" : ""}>${o}</option>`).join("")}</optgroup>`
          : g.options.map((o) => `<option value="${escAttr(o)}" ${d.category === o ? "selected" : ""}>${o}</option>`).join("")
        ).join("")}
      </select></label>
      ${mapped ? `<div class="applies-chip ${mapped.group === "skip" ? "skip" : ""}">${mapped.label ? t("review.appliesTo", { label: mapped.label }) : t("review.notCountedToward")}</div>` : ""}
    </div>
    <div id="rent-helper-fields">${rentHelperFields(d)}</div>
    ${paymentModeField(d)}
    ${familyMemberField(d)}
    <div class="field">
      <label>${t("review.notesLabel")}
      <input class="input" data-field="notes" value="${escAttr(d.notes)}" placeholder="${t("review.notesPlaceholder")}" /></label>
    </div>

    <div class="save-btn">
      <button class="btn-primary" data-action="save-receipt" style="margin-top:4px;">${t("review.save")}</button>
      <button type="button" class="discard" data-action="discard-receipt">${t("review.discard")}</button>
      <div class="micro-disc">${ic("info")}${t("review.microDisc")}</div>
    </div>
    <div style="height:16px"></div>
  `;
}
// Rent helper (task 7): landlord PAN + relationship fields, and a TDS
// warning that only appears once the entered monthly rent crosses the
// Section 393 (was 194-IB) threshold -- all read from TAX_CONFIG, nothing
// hardcoded here.
const RENT_RELATIONSHIP_OPTIONS = ["Not a relative", "Parent", "Spouse", "Sibling", "Other relative"];
function rentHelperFields(d) {
  if (d.category !== "Rent (for HRA)") return "";
  const monthly = Number(d.amount) || 0;
  const tds = TaxEngine.TAX_CONFIG.rentTDS;
  const panRequired = monthly * 12 > TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent;
  const tdsApplies = monthly > tds.thresholdMonthly;
  return `
    <div class="field">
      <label>${t("review.rentLandlordPanLabel")}
      <input class="input" data-field="landlordPan" value="${escAttr(d.landlordPan)}" placeholder="${t("review.rentLandlordPanPlaceholder")}" /></label>
      ${panRequired ? `<p class="note">${t("review.rentPanRequiredNote", { amount: inr(TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent) })}</p>` : ""}
    </div>
    <div class="field">
      <label>${t("review.rentRelationshipLabel")}
      <select class="input" data-field="landlordRelationship">
        <option value="" ${!d.landlordRelationship ? "selected" : ""} disabled>${t("review.rentRelationshipPlaceholder")}</option>
        ${RENT_RELATIONSHIP_OPTIONS.map((o) => `<option value="${escAttr(o)}" ${d.landlordRelationship === o ? "selected" : ""}>${o}</option>`).join("")}
      </select></label>
    </div>
    ${tdsApplies ? `<p class="note flag">${t("review.rentTdsWarning", { threshold: inr(tds.thresholdMonthly), rate: Math.round(tds.ratePanProvided * 100), noPanRate: Math.round(tds.rateNoPan * 100), sectionNew: tds.sectionNew, sectionOld: tds.sectionOld })}</p>` : ""}
    <p class="note">${t("review.rentPanAadhaarReminder")}</p>
  `;
}
// Payment mode (task 5, post-extraction rule checks): only asked for
// categories where the mode of payment changes whether the amount is
// deductible at all -- Section 126 (80D) premiums and Section 133 (80G)
// donations. Values are lowercase to match TaxEngine.isSection126/133*
// CashDisallowed(), which key off paymentMode === "cash".
const PAYMENT_MODE_CATEGORIES = ["Health Insurance — Self/Family", "Health Insurance — Parents", "Preventive Health Checkup", "Donation"];
const PAYMENT_MODE_OPTIONS = [["cash", "review.paymentModeCash"], ["upi", "review.paymentModeUpi"], ["card", "review.paymentModeCard"], ["cheque", "review.paymentModeCheque"], ["neft", "review.paymentModeNeft"], ["other", "review.paymentModeOther"]];
function paymentModeField(d) {
  if (!PAYMENT_MODE_CATEGORIES.includes(d.category)) return "";
  return `
    <div class="field">
      <label>${t("review.paymentModeLabel")}
      <select class="input" data-field="paymentMode">
        <option value="" ${!d.paymentMode ? "selected" : ""} disabled>${t("review.paymentModePlaceholder")}</option>
        ${PAYMENT_MODE_OPTIONS.map(([value, key]) => `<option value="${value}" ${d.paymentMode === value ? "selected" : ""}>${t(key)}</option>`).join("")}
      </select></label>
    </div>
  `;
}
// Family profiles (task 7): log a parent's premium or a child's tuition
// under the right person. Deliberately lightweight -- just a name + relation
// tag, no ages/DOBs/second profile system. The receipt stores the member's
// name directly (not an id) since there's no backend to keep them in sync
// if a family member is later renamed or removed.
const CATEGORY_TO_FAMILY_RELATION = { "Health Insurance — Parents": "Parent", "Tuition Fees": "Child" };
function familyMembersByRelation(relation) {
  return STATE.familyMembers.filter((m) => m.relation === relation);
}
function addFamilyMember(name, relation) {
  if (!name.trim()) return;
  STATE.familyMembers.push({ id: "fm" + Date.now(), name: name.trim(), relation });
}
function removeFamilyMember(id) {
  STATE.familyMembers = STATE.familyMembers.filter((m) => m.id !== id);
}
function familyMemberField(d) {
  const relation = CATEGORY_TO_FAMILY_RELATION[d.category];
  if (!relation) return "";
  const members = familyMembersByRelation(relation);
  const label = relation === "Parent" ? t("review.familyParentLabel") : t("review.familyChildLabel");
  if (members.length === 0) {
    return `<p class="note">${t("review.familyNoneAdded", { relation: relation.toLowerCase() })}</p>`;
  }
  return `<div class="field">
    <label>${label}
    <select class="input" data-field="familyMember">
      <option value="" ${!d.familyMember ? "selected" : ""}>${t("review.familyNotSpecified")}</option>
      ${members.map((m) => `<option value="${escAttr(m.name)}" ${d.familyMember === m.name ? "selected" : ""}>${escAttr(m.name)}</option>`).join("")}
    </select></label>
  </div>`;
}
function updateDraftField(field, value) {
  if (!STATE.reviewDraft) return;
  STATE.reviewDraft[field] = value;
  if (field === "category") renderReview();
}
// Maps TaxEngine.checkReceiptRules() codes to translated messages (task 5).
const RULE_WARNING_KEYS = {
  duplicate: "review.warnDuplicate",
  dateOutsideFY: "review.warnDateOutsideFY",
  cash126Disallowed: "review.warnCash126Disallowed",
  cash133OverLimit: "review.warnCash133OverLimit",
};
function saveReceipt() {
  const d = STATE.reviewDraft;
  if (!d.vendor.trim()) return showToast(t("review.toastVendor"));
  if (!d.amount || Number(d.amount) <= 0) return showToast(t("review.toastAmount"));
  if (!d.category) return showToast(t("review.toastCategory"));
  const ruleWarnings = TaxEngine.checkReceiptRules(d, STATE.receipts);
  STATE.receipts.push({
    id: "r" + Date.now(), vendor: d.vendor.trim(), date: d.date, amount: Number(d.amount), category: d.category,
    notes: d.notes.trim(), photo: d.photo, lowConfidence: d.lowConfidence, source: STATE.reviewDraftSource,
    landlordPan: (d.landlordPan || "").trim(), landlordRelationship: d.landlordRelationship || "",
    familyMember: d.familyMember || "", paymentMode: d.paymentMode || "", ruleWarnings,
  });
  // A rule warning is more actionable than the generic "saved" toast -- show
  // the first one instead when there is one. This never blocks the save
  // (CLAUDE.md: informational tool only); the receipt is still flagged with
  // the "Check" chip wherever it's listed, see isReceiptFlagged().
  const mapped = TaxEngine.CATEGORY_MAP[d.category];
  const warningKey = ruleWarnings.length && RULE_WARNING_KEYS[ruleWarnings[0]];
  showToast(warningKey ? t(warningKey) : mapped && mapped.label ? t("quickconfirm.savedTowardToast", { label: mapped.label.split(" — ")[0] }) : t("review.savedToast"));
  STATE.reviewDraft = null;
  showApp("overview");
}
function discardReceipt() { STATE.reviewDraft = null; showApp("overview"); }

// ============================================================
// Main app shell — Overview / Receipts / Report / Settings
// ============================================================
const NAV = {
  overview: ["home", () => t("nav.overview")],
  receipts: ["receipt", () => t("nav.receipts")],
  report: ["report", () => t("nav.report")],
  glossary: ["info", () => t("nav.glossary")],
  settings: ["gear", () => t("nav.settings")],
};
const APP_VIEWS = { overview: renderOverviewView, receipts: renderReceiptsView, report: renderReportView, glossary: renderGlossaryLibraryView, settings: renderSettingsView };

function headBar(title, sub) {
  return `<div class="head"><h1>${title}${sub ? ` <span class="muted">${sub}</span>` : ""}</h1>
  <button class="icon-btn" type="button" data-act="hide" aria-label="${SETTINGS.hideAmounts ? t("common.showAmounts") : t("common.hideAmounts")}" title="${SETTINGS.hideAmounts ? t("common.showAmounts") : t("common.hideAmounts")}">${ic(SETTINGS.hideAmounts ? "eyeoff" : "eye")}</button>
  <button class="btn" type="button" data-act="goto-camera">${ic("camera")}<span class="snap-label">${t("common.snapReceipt")}</span></button></div>`;
}

function renderApp() {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    const [i, label] = NAV[b.dataset.view];
    b.innerHTML = ic(i) + label();
    if (b.dataset.view === STATE.appView) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  el("tabbar").innerHTML = Object.entries(NAV).map(([k, [i, label]]) => `<button type="button" data-view="${k}"${k === STATE.appView ? ' aria-current="page"' : ""}>${ic(i)}${label()}</button>`).join("");
  el("side-foot").innerHTML = `${FY_LABEL}<br><span class="muted">${t("common.sampleDataFooter")}</span>`;
  el("view").innerHTML = (APP_VIEWS[STATE.appView] || renderOverviewView)();
  renderGlossarySheet();
  // Big thumb-reach Snap button on phones (task 6) -- the header's Snap
  // button collapses to an icon-only control on narrow screens; this FAB
  // (hidden above the mobile breakpoint, see style.css) is the "real" one.
  const fab = el("snap-fab");
  if (fab) { fab.innerHTML = ic("camera"); fab.setAttribute("aria-label", t("common.snapReceipt")); fab.title = t("common.snapReceipt"); }
}

// ---------- Overview ----------
function overviewSections() {
  const cmp = getComparison();
  const cap126Self = TaxEngine.getSection126SelfCap(STATE.onboarding.section126);
  const cap126Parents = TaxEngine.getSection126ParentsCap(STATE.onboarding.section126);
  const list = [
    { num: "123", old: "80C", label: t("overview.investmentsLabel"), gloss: t("overview.investmentsGloss"), cap: TaxEngine.SECTION_CAPS.s123.cap, used: cmp.deductionsUsed.s123, group: "s123" },
    { num: "124", old: "80CCD(1B)", label: t("overview.extraNpsLabel"), gloss: t("overview.extraNpsGloss", { cap: fmtINR(TaxEngine.SECTION_CAPS.s124.cap) }), cap: TaxEngine.SECTION_CAPS.s124.cap, used: cmp.deductionsUsed.s124, group: "s124" },
    { num: "126", old: "80D", label: t("overview.healthSelfLabel"), gloss: t("overview.healthSelfGloss"), cap: cap126Self, used: cmp.deductionsUsed.s126self, group: "s126self" },
    { num: "126", old: "80D", label: t("overview.healthParentsLabel"), gloss: t("overview.healthParentsGloss"), cap: cap126Parents, used: cmp.deductionsUsed.s126parents, group: "s126parents" },
  ];
  if (hasHomeLoan()) list.push({ num: "22", old: "24(b)", label: t("overview.homeLoanInterestLabel"), gloss: t("overview.homeLoanInterestGloss"), cap: TaxEngine.SECTION_CAPS.s22.cap, used: cmp.deductionsUsed.s22, group: "s22" });
  return list;
}
// A receipt needs a second look either because extraction was unsure of a
// field (lowConfidence) or because checkReceiptRules() found something
// (duplicate, cash-disallowed, date outside the FY) -- same "Check" chip
// either way.
function isReceiptFlagged(r) {
  return !!((r.lowConfidence && r.lowConfidence.length) || (r.ruleWarnings && r.ruleWarnings.length));
}
function capCard(s) {
  const st = status(s.used, s.cap);
  const segs = receiptsForGroup(s.group).map((r) => Number(r.amount || 0));
  const flagged = receiptsForGroup(s.group).some(isReceiptFlagged);
  const note = st === "done" ? t("overview.capNoteDone") : st === "none" ? t("overview.capNoteNone") : t("overview.capNoteRoom", { room: inr(s.cap - s.used), days: daysLeftInFY() });
  return `<article class="cap"><div class="cap-top"><h4>${s.label}<span class="sec-no">${secLabel(s.num, s.old)} · ${s.gloss}</span></h4>${flagged ? chip("check") : chip(st)}</div>
  ${meter(s.used, s.cap, st, segs)}<div class="cap-fig"><span><b class="num">${inr(s.used)}</b> of <span class="num">${inr(s.cap)}</span></span><span class="num">${s.cap > 0 ? Math.round((s.used / s.cap) * 100) : 0}%</span></div><p class="note">${note}</p></article>`;
}
function hraCard(cmp) {
  if (!hasHRA()) return "";
  return `<article class="cap"><div class="cap-top"><h4>${gloss("hra", t("overview.hraTitle"))}<span class="sec-no">${t("overview.hraMeta", { rent: inr(rentPaidAnnual()), city: escAttr(STATE.onboarding.city || t("overview.hraCityNotSet")) })}</span></h4>${chip("room", t("overview.hraEstimateChip"))}</div><span class="figure num">${t("overview.hraFigure", { amount: inr(cmp.hraExempt) })}</span><p class="note">${t("overview.hraNote")}</p></article>`;
}
// ---------- "Tax words" glossary (task 4b) ----------
// Entries with a real tax figure in their text carry {{placeholders}} instead
// of a baked-in number, filled in here from TaxEngine -- same single-source-
// of-truth rule as every other rupee amount in the app.
function glossaryVars() {
  return {
    newRebateThreshold: fmtINR(TaxEngine.REBATE_THRESHOLD.new),
    oldRebateThreshold: fmtINR(TaxEngine.REBATE_THRESHOLD.old),
    landlordPanThreshold: fmtINR(TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent),
    fyLabel: FY_LABEL,
    fyStart: fmtD(FY_START),
    fyEnd: fmtD(FY_END),
  };
}
function glossEntry(key) {
  const raw = GLOSSARY[key];
  if (!raw) return null;
  const vars = glossaryVars();
  return Object.assign({}, raw, { plain: interpolate(raw.plain, vars), example: interpolate(raw.example || "", vars) });
}
// Wraps a label so it's underlined and opens the glossary sheet on tap --
// never hover-only (WCAG 3.1.3). Falls back to the plain label if the key
// has no entry, so a typo here fails safe instead of silently losing text.
function gloss(key, label) {
  if (!GLOSSARY[key]) return label;
  return `<button type="button" class="gloss-term" data-act="open-glossary" data-value="${key}">${label}<span aria-hidden="true">ⓘ</span></button>`;
}
const APPLIES_TO_KEY = { new: "appliesToNew", old: "appliesToOld", both: "appliesToBoth" };
function renderGlossarySheet() {
  const sheetEl = el("glossary-sheet");
  if (!sheetEl) return;
  const entry = STATE.glossaryOpen && glossEntry(STATE.glossaryOpen);
  if (!entry) { sheetEl.hidden = true; sheetEl.innerHTML = ""; return; }
  sheetEl.hidden = false;
  sheetEl.innerHTML = `
    <button type="button" class="sheet-backdrop" data-act="close-glossary" aria-label="${t("glossary.close")}"></button>
    <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="${escAttr(entry.term)}">
      <div class="cap-top"><h4>${entry.term}</h4><button type="button" class="icon-btn" data-act="close-glossary" aria-label="${t("glossary.close")}">${ic("eyeoff")}</button></div>
      <p>${entry.plain}</p>
      ${entry.example ? `<p class="note">${entry.example}</p>` : ""}
      <p class="meta">${t("glossary.whereYouSeeIt")}: ${entry.whereYouSeeIt} · ${t("glossary." + APPLIES_TO_KEY[entry.appliesTo])}</p>
      <div class="nav-row">
        <button type="button" class="btn-ghost" data-act="read-aloud" data-value="${STATE.glossaryOpen}">${ic("info")}${t("glossary.readAloud")}</button>
        <button type="button" class="btn-secondary" data-act="goto-glossary-library">${t("glossary.seeFullEntry")}</button>
      </div>
    </div>`;
}
function speakGlossary(key) {
  const entry = glossEntry(key);
  if (!entry || typeof window.speechSynthesis === "undefined") { showToast(t("glossary.readAloudUnavailable")); return; }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(`${entry.term}. ${entry.plain}`));
}
function glossaryResultsHTML() {
  const q = STATE.glossaryQuery.trim().toLowerCase();
  const rows = Object.keys(GLOSSARY).filter((k) => !k.startsWith("_"))
    .map((key) => ({ key, entry: glossEntry(key) }))
    .filter(({ entry }) => !q || entry.term.toLowerCase().includes(q) || entry.plain.toLowerCase().includes(q));
  if (rows.length === 0) return `<p class="meta">${t("glossary.noResults")}</p>`;
  return rows.map(({ key, entry }) => `
    <article class="card gloss-entry">
      <h4>${entry.term}</h4>
      <p>${entry.plain}</p>
      ${entry.example ? `<p class="note">${entry.example}</p>` : ""}
      <p class="meta">${t("glossary.whereYouSeeIt")}: ${entry.whereYouSeeIt} · ${t("glossary." + APPLIES_TO_KEY[entry.appliesTo])}</p>
      <button type="button" class="btn-ghost" data-act="read-aloud" data-value="${key}">${ic("info")}${t("glossary.readAloud")}</button>
    </article>`).join("");
}
function renderGlossaryLibraryView() {
  return headBar(t("glossary.libraryTitle"), t("glossary.librarySub")) + `
  <input class="text-input" id="glossary-search" type="search" placeholder="${t("glossary.searchPlaceholder")}" aria-label="${t("glossary.searchPlaceholder")}" value="${escAttr(STATE.glossaryQuery)}" />
  <div id="glossary-results">${glossaryResultsHTML()}</div>
  ${DISC}`;
}

function donationCard(cmp) {
  if (!(cmp.deductionsUsed.s133 > 0)) return "";
  return `<article class="cap"><div class="cap-top"><h4>${t("overview.donationsTitle")}<span class="sec-no">${secLabel("133")}</span></h4>${chip("room", t("overview.donationsLoggedChip"))}</div><span class="figure num">${inr(cmp.deductionsUsed.s133)}</span><p class="note">${t("overview.donationsNote")}</p></article>`;
}
function newRegimeCard(cmp, gap) {
  const rebateFree = cmp.newTaxable <= TaxEngine.REBATE_THRESHOLD.new;
  const compareLine = gap === 0
    ? t("overview.compareTie")
    : gap < 0
      ? t("overview.compareOldCheaper", { amount: inr(Math.abs(gap)) })
      : t("overview.compareNewCheaper", { amount: inr(gap) });
  return `<article class="cap"><div class="cap-top"><h4>${t("overview.newRegimeTitle")}<span class="sec-no">${t("overview.newRegimeMeta", { std: fmtINR(TaxEngine.STANDARD_DEDUCTION.new), threshold: fmtINR(TaxEngine.REBATE_THRESHOLD.new) })}</span></h4>${chip("room", t("overview.newRegimeTrackingChip"))}</div><p class="note">${t("overview.newRegimeBody", { status: rebateFree ? t("overview.taxFree") : t("overview.payable", { amount: fmtINR(cmp.newTax) }) })}</p><p class="note">${compareLine}</p></article>`;
}
function shortInr(n) {
  if (SETTINGS.numFormat === "intl") return n >= 1000000 ? "₹" + +(n / 1e6).toFixed(2) + "M" : n >= 1000 ? "₹" + Math.round(n / 1000) + "k" : "₹" + n;
  return n >= 100000 ? "₹" + +(n / 100000).toFixed(2) + "L" : n >= 1000 ? "₹" + Math.round(n / 1000) + "k" : "₹" + n;
}
// Apr–Mar bar chart of deductible amounts logged per month (HRA and
// skipped receipts excluded, same as the Peacock reference). Months after
// the current one, and the current month before anything's logged in it,
// render as a dashed empty outline instead of a bar.
function monthlyChart() {
  const M = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  const nowIdx = (new Date().getMonth() + 9) % 12;
  const v = M.map((m, i) => STATE.receipts
    .filter((r) => { const mapped = TaxEngine.CATEGORY_MAP[r.category]; return mapped && mapped.group !== "hra" && mapped.group !== "skip" && new Date(r.date).getMonth() === (i + 3) % 12; })
    .reduce((a, r) => a + Number(r.amount || 0), 0));
  const W = 620, H = 230, L = 46, R = 8, T = 20, B = 28, max = 150000, cw = (W - L - R) / 12, bw = cw * 0.58;
  const y = (x) => T + (H - T - B) * (1 - x / max);
  let g = "";
  for (const t of [0, 50000, 100000, 150000]) g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t ? shortInr(t) : "0"}</text>`;
  M.forEach((m, i) => {
    const x = L + i * cw + (cw - bw) / 2;
    if (i > nowIdx || (!v[i] && i === nowIdx)) {
      g += `<rect x="${x}" y="${y(0) - 24}" width="${bw}" height="24" rx="4" fill="none" stroke="var(--line)" stroke-dasharray="3 3"/>`;
    } else if (v[i]) {
      g += `<rect x="${x}" y="${y(v[i])}" width="${bw}" height="${y(0) - y(v[i])}" rx="4" fill="color-mix(in srgb,var(--brand) 60%,var(--surf))"/><text class="val money" x="${x + bw / 2}" y="${y(v[i]) - 6}" text-anchor="middle">${shortInr(v[i])}</text>`;
    }
    g += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle"${i === nowIdx ? ' style="fill:var(--ink);font-weight:600"' : ""}>${m}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deductions logged per month, April to March">${g}</svg>`;
}
function rrow(r) {
  const mapped = TaxEngine.CATEGORY_MAP[r.category];
  return `<div class="rrow"><div class="rthumb">${ic("receipt")}</div><div style="min-width:0"><div class="who">${r.vendor}</div><div class="meta">${fmtD(r.date)} · ${mapped && mapped.label ? mapped.label.split(" — ")[0] : r.category}</div></div><div class="amt"><span class="num">${inr(r.amount)}</span>${isReceiptFlagged(r) ? chip("check", "Check") : ""}</div></div>`;
}
function renderOverviewView() {
  const cmp = getComparison();
  const saved = computeSavedVsNoDeductions();
  const gap = cmp.oldTax - cmp.newTax; // >0 => New Regime cheaper
  const newBetter = gap > 0;
  const pending = STATE.pendingDetected.length;
  const regimePill = STATE.regime === "compare" ? t("overview.comparingRegimes") : STATE.regime === "old" ? t("common.oldRegime") : t("common.newRegime");

  const detectBanner = pending > 0 ? `
    <button type="button" class="card" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:.75rem; flex-wrap:wrap; width:100%; text-align:left;" data-act="goto-quickconfirm">
      <div><div style="font-weight:700;">${t("overview.detectBannerTitle", { n: pending, s: pending > 1 ? "s" : "" })}</div>
      <div class="meta">${t("overview.detectBannerMeta", { vendors: STATE.pendingDetected.map((d) => d.vendor).join(", ") })}</div></div>
      <span class="chip st-room">${ic("clock")}${t("overview.reviewArrow")}</span>
    </button>` : "";

  // Task 4a: new regime is the default, so we only speak up about the old
  // regime when it actually wins by more than TAX_CONFIG.oldRegimeNudgeThreshold.
  // Once the user has explicitly turned on Old/Compare in Settings, keep
  // showing the full comparison card (it's what they asked to see).
  const onOldRegime = STATE.regime === "old";
  const nudgeOldRegime = STATE.regime === "new" && !newBetter && Math.abs(gap) >= TaxEngine.OLD_REGIME_NUDGE_THRESHOLD;
  const showRegimeCard = STATE.regime === "compare" || onOldRegime || nudgeOldRegime;
  const regimeCard = showRegimeCard ? `<div class="regime-card"><div style="flex:1 1 14rem"><h4>${nudgeOldRegime ? t("overview.oldRegimeNudgeTitle") : newBetter ? t("overview.regimeCardTitleNewBetter") : t("overview.regimeCardTitleOldBetter")}</h4>
    <p>${nudgeOldRegime ? t("overview.oldRegimeNudgeBody", { amount: inr(Math.abs(gap)) }) : t("overview.regimeCardBody", { amount: inr(Math.abs(gap)) })}</p></div>
    <div class="cmp"><div><span class="eyebrow">${t("overview.old")}</span><br><b class="num ${newBetter ? "" : "lower"}">${inr(cmp.oldTax)}</b></div><div><span class="eyebrow">${t("overview.new")}</span><br><b class="num ${newBetter ? "lower" : ""}">${inr(cmp.newTax)}</b></div></div></div>` : "";

  // Deduction trackers (123/124/126/22/HRA) only matter on the Old Regime, so
  // they stay hidden unless the old regime is actually helping this user, or
  // they've turned it on themselves in Settings (task 4a).
  const caps = onOldRegime || STATE.regime === "compare"
    ? overviewSections().map(capCard).join("") + hraCard(cmp) + donationCard(cmp)
    : newRegimeCard(cmp, gap);

  // Headline always leads with the tax on the regime actually in effect —
  // new tax regime (default) unless the user switched to Old in Settings —
  // never a figure that contradicts the regime-card below it.
  const headlineTax = onOldRegime ? cmp.oldTax : cmp.newTax;
  const headlineSuffix = gloss("regime", onOldRegime ? t("overview.oldTaxRegimeSuffix") : t("overview.newRegimeDefaultSuffix"));

  return headBar(t("overview.greeting"), t("overview.greetingSub")) + `
  <div style="display:flex;gap:.5rem;flex-wrap:wrap"><span class="pill">${regimePill}</span><span class="pill">${FY_LABEL}</span><span class="pill">${STATE.onboarding.employment || t("overview.exampleUser")}</span></div>
  <div class="hero">
   <div><span class="eyebrow">${t("overview.estimatedTaxLabel")}</span><span class="big num">${inr(headlineTax)}</span><small>${headlineSuffix}</small></div>
   <div><span class="eyebrow">${t("overview.savedHero")}</span><span class="big num">${inr(saved)}</span><small>${t("overview.savedSub")}</small></div>
   <div><span class="eyebrow">${t("overview.timeToInvest")}</span><span class="mid num">${t("overview.daysLabel", { n: daysLeftInFY() })}</span><small>${t("overview.untilMarch")}</small><div class="fy-track" aria-hidden="true"><i style="width:${fyPct() * 100}%"></i></div></div>
  </div>
  ${detectBanner}
  ${regimeCard}
  <div class="caps">${caps}</div>
  ${STATE.receipts.length === 0 && pending === 0 ? `<div class="empty-note">${t("overview.emptyNote")}</div>` : ""}
  <div class="duo">
   <div class="card chart"><h3>${t("overview.chartTitle")} <small>${t("overview.chartSub")}</small></h3>${monthlyChart()}</div>
   <div class="card"><h3>${t("overview.recentReceipts")} <small>${t("overview.recentReceiptsCount", { n: STATE.receipts.length })}</small></h3>${STATE.receipts.slice(-4).reverse().map(rrow).join("") || `<p class="meta">${t("overview.noReceiptsYet")}</p>`}</div>
  </div>
  <button type="button" class="btn-ghost" style="border:1px dashed var(--line); border-radius:12px;" data-act="enter-manually">${t("common.enterReceiptManually")}</button>
  ${DISC}`;
}

// ---------- Receipts ----------
const RECEIPT_FILTER_GROUPS = { "123": ["s123"], "124": ["s124"], "126": ["s126self", "s126parents"], "22": ["s22"], "133": ["s133"] };
function renderReceiptsView() {
  const filter = STATE.receiptFilter;
  const opts = [["all", t("receipts.filterAll")], ...["123", "124", "126", "22", "133"].map((s) => [s, secLabel(s)]), ["HRA", t("receipts.filterHRA")]];
  const list = STATE.receipts
    .filter((r) => {
      if (filter === "all") return true;
      const mapped = TaxEngine.CATEGORY_MAP[r.category];
      if (filter === "HRA") return mapped && mapped.group === "hra";
      return mapped && RECEIPT_FILTER_GROUPS[filter].includes(mapped.group);
    })
    .slice().reverse();

  const pending = STATE.pendingDetected.length;
  const detectBanner = pending > 0 ? `
    <button type="button" class="card" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:.75rem; flex-wrap:wrap; width:100%; text-align:left;" data-act="goto-quickconfirm">
      <div><div style="font-weight:700;">${t("overview.detectBannerTitle", { n: pending, s: pending > 1 ? "s" : "" })}</div>
      <div class="meta">${t("overview.detectBannerMetaGeneric")}</div></div>
      <span class="chip st-room">${ic("clock")}${t("overview.reviewArrow")}</span>
    </button>` : "";

  const rows = list.map((r) => {
    const mapped = TaxEngine.CATEGORY_MAP[r.category];
    const flagged = isReceiptFlagged(r);
    return `<tr><td class="num">${fmtD(r.date)}</td><td><b style="font-weight:600">${r.vendor}</b>${r.familyMember ? `<div class="meta">${escAttr(r.familyMember)}</div>` : ""}</td><td>${r.category}</td><td>${mapped && mapped.group === "hra" ? t("receipts.hraExemptionLabel") : mapped && mapped.label ? mapped.label : t("common.notCounted")}</td><td class="r num">${inr(r.amount)}</td><td>${flagged ? chip("check", t("receipts.doubleCheckChip")) : chip("done", t("receipts.savedChip"))}</td></tr>`;
  }).join("");

  return headBar(t("receipts.headerTitle")) + detectBanner + `
  <div class="toolbar">${opts.map(([k, label]) => `<button class="fchip" type="button" data-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join("")}
  <button class="btn ghost" type="button" style="margin-left:auto" data-act="enter-manually">${t("common.enterManually")}</button></div>
  ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>${t("receipts.tableDate")}</th><th>${t("receipts.tablePaidTo")}</th><th>${t("receipts.tableCategory")}</th><th>${t("receipts.tableCounts")}</th><th class="r">${t("receipts.tableAmount")}</th><th>${t("receipts.tableState")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty-note">${t("receipts.emptyFilterNote")}</div>`}
  ${DISC}`;
}

// ---------- Report ----------
/**
 * Pure data assembly for the year-end report — no DOM, no PDF library.
 * Shared by the on-screen report (renderReportView, currency shown as ₹) and
 * the PDF export (exportPDF, currency shown as "Rs." since jsPDF's default
 * fonts have no ₹ glyph). Pass fmtRs to get PDF-safe text; defaults to
 * fmtINR for the screen.
 */
function buildReportData(fmtCurrency = fmtINR) {
  const cmp = getComparison();
  const cap126Self = TaxEngine.getSection126SelfCap(STATE.onboarding.section126);
  const cap126Parents = TaxEngine.getSection126ParentsCap(STATE.onboarding.section126);
  const deductionRows = [
    { sectionNew: "Section 123", sectionOld: "80C", used: cmp.deductionsUsed.s123, cap: TaxEngine.SECTION_CAPS.s123.cap },
    { sectionNew: "Section 124", sectionOld: "80CCD(1B)", used: cmp.deductionsUsed.s124, cap: TaxEngine.SECTION_CAPS.s124.cap },
    { sectionNew: "Section 126 · self & family", sectionOld: "80D", used: cmp.deductionsUsed.s126self, cap: cap126Self },
    { sectionNew: "Section 126 · parents", sectionOld: "80D", used: cmp.deductionsUsed.s126parents, cap: cap126Parents },
    { sectionNew: "Section 22", sectionOld: "24(b)", used: cmp.deductionsUsed.s22, cap: TaxEngine.SECTION_CAPS.s22.cap },
  ]
    .filter((r) => r.used > 0)
    .map((r) => { const room = Math.max(0, r.cap - r.used); return { ...r, room, hasRoom: room > 0 }; });

  // Preventive checkup and tuition both get folded into a combined Section
  // cap (s126self / s123 respectively, see CATEGORY_MAP's comment on the
  // checkup), so "was it logged" has to check actual receipts, not the
  // aggregated cap usage like the checks above.
  const hasPreventiveCheckup = STATE.receipts.some((r) => r.category === "Preventive Health Checkup");
  const hasTuition = STATE.receipts.some((r) => r.category === "Tuition Fees");

  const missedItems = [];
  if (cmp.deductionsUsed.s126self === 0) missedItems.push(t("report.missedHealthSelf"));
  if (cmp.deductionsUsed.s126parents === 0) missedItems.push(t("report.missedHealthParents"));
  if (cmp.deductionsUsed.s22 === 0 && hasHomeLoan()) missedItems.push(t("report.missedHomeLoan"));
  if (cmp.deductionsUsed.s133 === 0) missedItems.push(t("report.missedDonations"));
  if (cmp.deductionsUsed.s124 === 0) missedItems.push(t("report.missedNps", { amount: fmtCurrency(TaxEngine.SECTION_CAPS.s124.cap) }));
  if (!hasPreventiveCheckup) missedItems.push(t("report.missedPreventiveCheckup", { amount: fmtCurrency(TaxEngine.TAX_CONFIG.cashRules.s126PreventiveCheckupCashCap) }));
  if (!hasTuition) missedItems.push(t("report.missedTuition"));

  return {
    title: t("report.title", { fy: FY_LABEL }),
    generatedDate: new Date(),
    receiptCount: STATE.receipts.length,
    headlineSaving: computeSavedVsNoDeductions(),
    bigDisclaimer: t("report.bigDisclaimer"),
    footerDisclaimer: t("report.footerDisclaimer"),
    regimeComparison: { oldTax: cmp.oldTax, newTax: cmp.newTax, betterRegime: cmp.betterRegime },
    deductionRows,
    missedItems,
    filename: "TaxPlot_Report_FY2026-27.pdf",
  };
}
// Post-filing tracker (task 7) -- e-verified / refund status, and the
// revised-return deadline from TAX_CONFIG.deadlines. Lives in SETTINGS (not
// STATE) since it tracks something that happens well after the filing
// season, long after any single in-memory session -- the one piece of
// filing-status state worth surviving a reload even though receipts don't.
function postFilingToggle(key, label, checked) {
  return `<div class="row"><div><span class="lbl">${label}</span></div><div><button type="button" class="switch" role="switch" data-toggle="${key}" aria-checked="${checked}" aria-label="${label}"></button></div></div>`;
}
function postFilingCard() {
  const pf = SETTINGS.postFiling;
  const revised = TaxEngine.DEADLINES.find((d) => d.label.toLowerCase().includes("revised return"));
  return `<div class="card">
    <h3>${t("report.postFilingTitle")}</h3>
    ${postFilingToggle("postFilingEVerified", t("report.postFilingEVerified"), pf.eVerified)}
    ${postFilingToggle("postFilingRefund", t("report.postFilingRefund"), pf.refundReceived)}
    ${revised ? `<p class="note">${t("report.postFilingRevisedDeadline", { date: fmtD(revised.date) })}</p>` : ""}
  </div>`;
}
function renderReportView() {
  const data = buildReportData();
  const rows = data.deductionRows.map((r) => {
    const st = r.hasRoom ? chip("room", t("report.moreRoom", { amount: fmtINR(r.room) })) : chip("done", t("report.fullyUsed"));
    return `<tr><td><b style="font-weight:600">${r.sectionNew}</b><div class="meta">${r.sectionOld}</div></td><td class="r num">${inr(r.used)}</td><td class="r num">${inr(r.cap)}</td><td>${st}</td></tr>`;
  }).join("");
  return `<div id="view-report">` + headBar(t("report.headerTitle", { fy: FY_LABEL }), t("report.headerSub")) + `
  <div class="big-disc">${ic("info")}<span>${data.bigDisclaimer}</span></div>
  <div class="hero"><div><span class="eyebrow">${t("report.savedSoFar")}</span><span class="big num">${inr(data.headlineSaving)}</span><small>${t("report.comparedNote")}</small></div>
  <div><span class="eyebrow">${t("common.oldRegime")}</span><span class="mid num">${inr(data.regimeComparison.oldTax)}</span><small>${t("report.estTax")}</small></div>
  <div><span class="eyebrow">${t("common.newRegime")}</span><span class="mid num" style="color:${data.regimeComparison.betterRegime === "new" ? "var(--ok)" : "var(--ink)"}">${inr(data.regimeComparison.newTax)}</span><small>${data.regimeComparison.betterRegime === "old" ? t("report.oldRegimeLower") : t("report.newRegimeLower")}</small></div></div>
  ${data.deductionRows.length > 0 ? `<div class="tbl-wrap"><table><thead><tr><th>${t("report.tableSection")}</th><th class="r">${t("report.tableUsed")}</th><th class="r">${t("report.tableCap")}</th><th>${t("report.tableStatus")}</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty-note">${t("report.emptyReport")}</div>`}
  ${data.missedItems.length > 0 ? `<div class="card"><h3>${t("report.missedHeader")}</h3><ul class="missed">${data.missedItems.map((m) => `<li>${ic("dash")}<span>${m}</span></li>`).join("")}</ul></div>` : ""}
  ${postFilingCard()}
  <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn ghost" type="button" data-act="export-pdf">${ic("down")}${t("report.downloadPdf")}</button><button class="btn ghost" type="button" data-act="export-employer-pack">${ic("down")}${t("report.downloadEmployerPack")}</button><button class="btn ghost" type="button" disabled title="Coming soon">${t("report.shareCA")}</button></div>
  <p class="meta">${t("report.employerPackNote")}</p>
  ${DISC}</div>`;
}

// ---------- PDF export (jsPDF + jspdf-autotable, loaded from cdnjs on demand) ----------
const PDF_LIB_URLS = {
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js",
};
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}
async function ensurePdfLibs() {
  if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === "function") return;
  await loadScriptOnce(PDF_LIB_URLS.jspdf);
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF failed to load");
  await loadScriptOnce(PDF_LIB_URLS.autotable);
  if (typeof window.jspdf.jsPDF.API.autoTable !== "function") throw new Error("jspdf-autotable failed to load");
}
const PDF_PAGE = { width: 595, height: 842, marginX: 40, footerY: 820, contentWidth: 515 };
function addFooters(doc, footerText) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.setTextColor(120);
    doc.text(footerText, PDF_PAGE.marginX, PDF_PAGE.footerY, { maxWidth: PDF_PAGE.contentWidth });
    doc.setTextColor(0);
  }
}
function renderReportPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = PDF_PAGE.marginX;
  let y = 50;

  doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, marginX, y); y += 20;
  doc.setFontSize(10); doc.setFont(undefined, "normal");
  doc.text(`Generated ${data.generatedDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} - Based on ${data.receiptCount} receipt${data.receiptCount === 1 ? "" : "s"}`, marginX, y);
  y += 26;

  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text(`Estimated saving: ${fmtRs(data.headlineSaving)}`, marginX, y); y += 16;

  doc.setFontSize(9); doc.setFont(undefined, "normal");
  const disclaimerLines = doc.splitTextToSize(data.bigDisclaimer, PDF_PAGE.contentWidth);
  doc.text(disclaimerLines, marginX, y); y += disclaimerLines.length * 12 + 18;

  doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.text("Old vs New Regime", marginX, y); y += 8;
  doc.autoTable({
    startY: y, margin: { left: marginX, right: marginX },
    head: [["Regime", "Estimated tax"]],
    body: [
      ["Old Regime" + (data.regimeComparison.betterRegime === "old" ? " (better)" : ""), fmtRs(data.regimeComparison.oldTax)],
      ["New Regime" + (data.regimeComparison.betterRegime === "new" ? " (better)" : ""), fmtRs(data.regimeComparison.newTax)],
    ],
    theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: [40, 40, 40] },
  });
  y = doc.lastAutoTable.finalY + 24;

  if (data.deductionRows.length > 0) {
    doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.text("Deduction breakdown", marginX, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Section (2025 Act)", "Old no.", "Used", "Cap", "Status"]],
      body: data.deductionRows.map((r) => [r.sectionNew, r.sectionOld, fmtRs(r.used), fmtRs(r.cap), r.hasRoom ? `${fmtRs(r.room)} more room` : "Fully used"]),
      theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: [40, 40, 40] },
    });
    y = doc.lastAutoTable.finalY + 24;
  } else {
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.text("No deductions logged yet this year.", marginX, y); y += 24;
  }

  if (data.missedItems.length > 0) {
    if (y > PDF_PAGE.footerY - 60) { doc.addPage(); y = 50; }
    doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.text("Didn't log this year", marginX, y); y += 16;
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    data.missedItems.forEach((m) => {
      const lines = doc.splitTextToSize("- " + m, PDF_PAGE.contentWidth);
      if (y + lines.length * 12 > PDF_PAGE.footerY - 20) { doc.addPage(); y = 50; }
      doc.text(lines, marginX, y); y += lines.length * 12 + 6;
    });
  }
  addFooters(doc, data.footerDisclaimer);
  doc.save(data.filename);
}
async function exportPDF() {
  const data = buildReportData(fmtRs);
  try { await ensurePdfLibs(); renderReportPDF(data); }
  catch (e) { console.error("PDF generation failed, falling back to print:", e); window.print(); }
}

// ---------- Employer proof pack (task 7) ----------
// A separate, simpler PDF from the year-end report: one section per
// deduction group with its own receipts listed, meant to be handed to an
// employer with the Jan-Feb Form 124 (was 12BB) investment declaration --
// not a tax computation, just the evidence grouped the way that form asks
// for it. Reuses the same jsPDF/autoTable setup as renderReportPDF().
const EMPLOYER_PACK_GROUPS = [
  { group: "s123", label: "Section 123 (80C)" },
  { group: "s124", label: "Section 124 (80CCD(1B))" },
  { group: "s126self", label: "Section 126 (80D) — self & family" },
  { group: "s126parents", label: "Section 126 (80D) — parents" },
  { group: "s22", label: "Section 22 (24(b)) — home loan interest" },
  { group: "hra", label: "HRA exemption — rent paid" },
  { group: "s133", label: "Section 133 (80G) — donations" },
];
function buildEmployerProofPackData() {
  const sections = EMPLOYER_PACK_GROUPS
    .map((g) => ({ ...g, receipts: receiptsForGroup(g.group) }))
    .filter((s) => s.receipts.length > 0)
    .map((s) => ({ ...s, total: s.receipts.reduce((sum, r) => sum + Number(r.amount || 0), 0) }));
  return {
    title: t("report.employerPackTitle", { fy: FY_LABEL }),
    generatedDate: new Date(),
    sections,
    footerDisclaimer: t("report.footerDisclaimer"),
    filename: "TaxPlot_Employer_Proof_Pack_FY2026-27.pdf",
  };
}
function renderEmployerProofPackPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = PDF_PAGE.marginX;
  let y = 50;

  doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, marginX, y); y += 20;
  doc.setFontSize(10); doc.setFont(undefined, "normal");
  doc.text(`Generated ${data.generatedDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} - for your employer's Form 124 (was 12BB) submission`, marginX, y);
  y += 26;

  if (data.sections.length === 0) {
    doc.setFontSize(10); doc.text("No deduction receipts logged yet this year.", marginX, y); y += 20;
  }
  data.sections.forEach((s) => {
    if (y > PDF_PAGE.footerY - 90) { doc.addPage(); y = 50; }
    doc.setFontSize(12); doc.setFont(undefined, "bold");
    doc.text(`${s.label} - total ${fmtRs(s.total)}`, marginX, y); y += 8;
    doc.autoTable({
      startY: y, margin: { left: marginX, right: marginX },
      head: [["Date", "Paid to", "Amount"]],
      body: s.receipts.map((r) => [new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), r.vendor + (r.familyMember ? ` (${r.familyMember})` : ""), fmtRs(r.amount)]),
      theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: [40, 40, 40] },
    });
    y = doc.lastAutoTable.finalY + 20;
  });
  addFooters(doc, data.footerDisclaimer);
  doc.save(data.filename);
}
async function exportEmployerProofPack() {
  const data = buildEmployerProofPackData();
  try { await ensurePdfLibs(); renderEmployerProofPackPDF(data); }
  catch (e) { console.error("Employer proof pack PDF generation failed, falling back to print:", e); window.print(); }
}

// Family profiles (task 7) -- managed from Settings since they're profile
// data, like onboarding answers, not something tied to any one receipt.
function familyMembersSection() {
  const rows = STATE.familyMembers.map((m) => `<div class="row"><div><span class="lbl">${escAttr(m.name)}</span><p class="help">${m.relation === "Parent" ? t("settings.familyRelationParent") : t("settings.familyRelationChild")}</p></div><div><button type="button" class="btn ghost" data-act="remove-family-member" data-id="${m.id}">${t("settings.familyRemove")}</button></div></div>`).join("");
  return `<section class="group" id="s-family"><header><h2>${t("settings.familyHeader")}</h2><p>${t("settings.familySub")}</p></header>
    ${rows || `<p class="meta">${t("settings.familyNone")}</p>`}
    <div class="row">
      <div style="flex:1 1 12rem"><input class="txt" id="set-family-name" placeholder="${t("settings.familyNamePlaceholder")}" aria-label="${t("settings.familyNamePlaceholder")}" style="width:100%"></div>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <select class="sel" id="set-family-relation" aria-label="${t("settings.familyRelationLabel")}">
          <option value="Parent">${t("settings.familyRelationParent")}</option>
          <option value="Child">${t("settings.familyRelationChild")}</option>
        </select>
        <button type="button" class="btn ghost" data-act="add-family-member">${t("settings.familyAdd")}</button>
      </div>
    </div>
   </section>`;
}
// ---------- Settings ----------
function renderSettingsView() {
  const ob = STATE.onboarding;
  const seg = (key, opts, getVal, isAppearance) => `<div class="seg" role="radiogroup">${opts.map(([v, label, i]) => `<button type="button" role="radio" data-set="${key}" data-val="${v}" data-appearance="${isAppearance ? 1 : 0}" aria-pressed="${getVal() === v}" aria-checked="${getVal() === v}">${i ? ic(i) : ""}${label}</button>`).join("")}</div>`;
  const sw = (key, label, getVal, isAppearance) => `<button type="button" class="switch" role="switch" data-toggle="${key}" data-appearance="${isAppearance ? 1 : 0}" aria-checked="${!!getVal()}" aria-label="${label}"></button>`;
  const row = (lbl, help, ctrl) => `<div class="row"><div><span class="lbl">${lbl}</span>${help ? `<p class="help">${help}</p>` : ""}</div><div>${ctrl}</div></div>`;
  const tp = (v, label, bg, sf, br) => `<button type="button" class="tp" data-set="theme" data-val="${v}" data-appearance="1" aria-pressed="${SETTINGS.theme === v}"><span class="mini" style="background:${bg}"><b style="background:${sf}"></b><b style="background:linear-gradient(${bg} 40%,${br} 40% 55%,${bg} 55%)"></b></span>${label}</button>`;
  const autoBg = "linear-gradient(135deg,#EEF4F5 50%,#071619 50%)";

  return `<div class="head"><h1>${t("settings.headerTitle")}</h1><button class="btn ghost" type="button" data-act="reset-settings">${t("settings.resetDefaults")}</button></div>
  <div class="set-groups">
   <section class="group" id="s-appearance"><header><h2>${t("settings.appearanceHeader")}</h2><p>${t("settings.appearanceSub")}</p></header>
    ${row(t("settings.themeLabel"), t("settings.themeHelp"), `<div class="theme-preview">${tp("auto", t("settings.themeAuto"), autoBg, "#0D2227", "#00657E")}${tp("light", t("settings.themeLight"), "#EEF4F5", "#FFFFFF", "#00657E")}${tp("dark", t("settings.themeDark"), "#071619", "#0D2227", "#4CC2DB")}</div>`)}
    ${row(t("settings.textSizeLabel"), t("settings.textSizeHelp"), seg("text", [["default", t("settings.textDefault")], ["large", t("settings.textLarge")]], () => SETTINGS.text, true))}
    ${row(t("settings.densityLabel"), t("settings.densityHelp"), seg("density", [["comfortable", t("settings.densityComfortable")], ["compact", t("settings.densityCompact")]], () => SETTINGS.density, true))}
    ${row(t("settings.motionLabel"), t("settings.motionHelp"), seg("motion", [["system", t("settings.motionFollow")], ["reduce", t("settings.motionReduce")]], () => SETTINGS.motion, true))}
   </section>
   <section class="group" id="s-privacy"><header><h2>${t("settings.privacyHeader")}</h2></header>
    ${row(t("settings.hideAmountsLabel"), t("settings.hideAmountsHelp"), sw("hideAmounts", t("common.hideAmounts"), () => SETTINGS.hideAmounts, true))}
   </section>
   <section class="group" id="s-numbers"><header><h2>${t("settings.moneyHeader")}</h2></header>
    ${row(t("settings.numberFormatLabel"), t("settings.numberFormatHelp"), seg("numFormat", [["lakh", t("settings.lakhCrore")], ["intl", t("settings.international")]], () => SETTINGS.numFormat, true))}
    ${row(t("settings.sectionNumbersLabel"), t("settings.sectionNumbersHelp"), seg("sectionOrder", [["new", "Section 123 (80C)"], ["old", "80C (Section 123)"]], () => SETTINGS.sectionOrder, true))}
   </section>
   <section class="group" id="s-tax"><header><h2>${t("settings.taxProfileHeader")}</h2><p>${t("settings.taxProfileSub")}</p></header>
    ${row(gloss("regime", t("settings.regimeLabel")), t("settings.regimeHelp"), seg("regime", [["compare", t("settings.regimeCompare")], ["old", t("settings.regimeOld")], ["new", t("settings.regimeNew")]], () => STATE.regime, false))}
    ${STATE.confirmRegimeOptOut ? row(t("settings.regimeOptOutQuestion", { regime: STATE.confirmRegimeOptOut === "old" ? t("settings.regimeOld") : t("settings.regimeCompare") }), t("settings.regimeOptOutHelp"), `<div class="confirm"><button class="btn danger" type="button" data-act="regime-optout-yes">${t("settings.regimeOptOutYes")}</button><button class="btn ghost" type="button" data-act="regime-optout-no">${t("settings.cancel")}</button></div>`) : ""}
    ${row(t("settings.ageLabel"), t("settings.ageHelp"), seg("age", [["under60", t("settings.ageUnder60")], ["senior", t("settings.ageSenior")]], () => (ob.section126.selfSenior ? "senior" : "under60"), false))}
    ${row(t("settings.parentsSeniorLabel"), t("settings.parentsSeniorHelp"), sw("parentsSenior", t("settings.parentsSeniorAria"), () => ob.section126.parentsSenior, false))}
    ${row(t("settings.cityLabel"), t("settings.cityHelp"), `<input class="txt" id="set-city" value="${escAttr(ob.city)}" aria-label="${t("settings.cityAria")}">`)}
    ${row(t("settings.exactIncomeLabel"), t("settings.exactIncomeHelp", { amount: fmtINR(currentIncome()) }), `<input class="txt" id="set-income" type="number" value="${STATE.income || ""}" placeholder="₹" aria-label="${t("settings.exactIncomeLabel")}">`)}
    ${row(t("settings.autoDetectLabel"), t("settings.autoDetectHelp"), sw("autoDetectEnabled", t("settings.autoDetectLabel"), () => STATE.autoDetectEnabled, false))}
   </section>
   ${familyMembersSection()}
   <section class="group" id="s-reminders"><header><h2>${t("settings.remindersHeader")}</h2></header>
    ${row(t("settings.monthlyNudgeLabel"), t("settings.monthlyNudgeHelp"), sw("remindMonthly", t("settings.monthlyNudgeAria"), () => SETTINGS.remindMonthly, true))}
    ${row(t("settings.deadlineAlertsLabel"), t("settings.deadlineAlertsHelp"), `<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">${sw("remindDeadline", t("settings.deadlineAlertsAria"), () => SETTINGS.remindDeadline, true)}<select class="sel" id="set-deadlineDays" aria-label="${t("settings.deadlineDaysAria")}">${[30, 45, 60, 90].map((d) => `<option value="${d}"${SETTINGS.deadlineDays === d ? " selected" : ""}>${t("settings.daysBeforeOption", { d })}</option>`).join("")}</select></div>`)}
    ${row(t("settings.quietHoursLabel"), t("settings.quietHoursHelp"), sw("quietHours", t("settings.quietHoursAria"), () => SETTINGS.quietHours, true))}
   </section>
   <section class="group" id="s-data"><header><h2>${t("settings.yourDataHeader")}</h2><p>${t("settings.yourDataSub")}</p></header>
    ${row(t("settings.downloadDataLabel"), t("settings.downloadDataHelp"), `<button class="btn ghost" type="button" data-act="export-data">${ic("down")}${t("settings.downloadDataBtn")}</button>`)}
    ${row(t("settings.resetDemoLabel"), t("settings.resetDemoHelp"), `<button class="btn ghost" type="button" data-act="reset-demo">${t("settings.resetDemoBtn")}</button>`)}
    ${row(t("settings.deleteAccountLabel"), t("settings.deleteAccountHelp"), STATE.confirmDelete
      ? `<div class="confirm"><span>${t("settings.deleteConfirmQuestion")}</span><button class="btn danger" type="button" data-act="del-yes">${t("settings.deleteYes")}</button><button class="btn ghost" type="button" data-act="del-no">${t("settings.cancel")}</button></div>`
      : `<button class="btn danger" type="button" data-act="del">${t("settings.deleteBtn")}</button>`)}
   </section>
   ${DISC}
  </div>`;
}

// ============================================================
// Event delegation — existing flows (onboarding/permission/camera/review/
// quick-confirm) use data-action; the app shell + Settings use data-view /
// data-filter / data-set / data-toggle / data-act, matching the Peacock
// reference prototypes.
// ============================================================
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const value = target.dataset.value;
  const id = target.dataset.id;
  switch (action) {
    case "set-employment": STATE.onboarding.employment = value; renderOnboarding(); break;
    case "set-income-band": STATE.onboarding.incomeBand = value; renderOnboarding(); break;
    case "toggle-commitment": {
      const ob = STATE.onboarding;
      if (value === "None of these yet") {
        ob.commitments = ob.commitments.includes(value) ? [] : ["None of these yet"];
      } else {
        ob.commitments = ob.commitments.filter((c) => c !== "None of these yet");
        if (ob.commitments.includes(value)) ob.commitments = ob.commitments.filter((c) => c !== value);
        else ob.commitments.push(value);
      }
      renderOnboarding();
      break;
    }
    case "ob-next": obNext(); break;
    case "ob-back": obBack(); break;
    case "enable-autodetect": enableAutoDetect(); break;
    case "skip-autodetect": skipAutoDetect(); break;
    case "goto-overview": showApp("overview"); break;
    case "goto-camera": gotoCamera(); break;
    case "qc-dismiss": qcDismiss(id); break;
    case "qc-confirm": qcConfirm(id); break;
    case "qc-edit": qcEditOrSplit(id); break;
    case "qc-split": qcEditOrSplit(id); break;
    case "open-camera": openCameraInput(); break;
    case "open-gallery": openGalleryInput(); break;
    case "retake-photo": retakePhoto(); break;
    case "use-photo": usePhoto(); break;
    case "enter-manually": enterManually(); break;
    case "save-receipt": saveReceipt(); break;
    case "discard-receipt": discardReceipt(); break;
    default: break;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.action === "file-selected") { onFileSelected(e.target); return; }
  const field = e.target.dataset && e.target.dataset.field;
  if (field) { updateDraftField(field, e.target.value); return; }
});
document.addEventListener("input", (e) => {
  const field = e.target.dataset && e.target.dataset.field;
  if (field && field !== "category") { STATE.reviewDraft[field] = e.target.value; }
  // Refresh just the rent-helper sub-section (not the whole review form, so
  // the amount input never loses focus) as the TDS-threshold check depends
  // on the amount the user is still typing.
  if (field === "amount" && STATE.reviewDraft && STATE.reviewDraft.category === "Rent (for HRA)") {
    const rentFields = el("rent-helper-fields");
    if (rentFields) rentFields.innerHTML = rentHelperFields(STATE.reviewDraft);
  }
  if (e.target.dataset && e.target.dataset.action === "set-city") { STATE.onboarding.city = e.target.value; }
  if (e.target.id === "glossary-search") {
    STATE.glossaryQuery = e.target.value;
    const results = el("glossary-results");
    if (results) results.innerHTML = glossaryResultsHTML();
  }
});

// App shell: nav, filters, settings.
function resetSettings() { Object.assign(SETTINGS, SETTINGS_DEFAULTS); saveSettings(); applyAppearance(); renderApp(); showToast(t("settings.toastSettingsReset")); }
function resetDemo() {
  STATE = {
    screen: "s-onboarding", appView: "overview", onboarding: freshOnboarding(), regime: null, income: null,
    autoDetectEnabled: false, receipts: [], pendingDetected: [], receiptFilter: "all", reviewDraft: null,
    reviewDraftSource: null, camera: { phase: "idle", photo: null }, confirmDelete: false, confirmRegimeOptOut: false,
    glossaryOpen: null, glossaryQuery: "", familyMembers: [], toast: null,
  };
  show("s-onboarding");
  showToast(t("settings.toastDemoReset"));
}
function exportData() {
  const blob = new Blob([JSON.stringify({ settings: SETTINGS, onboarding: STATE.onboarding, regime: STATE.regime, receipts: STATE.receipts }, null, 2)], { type: "application/json" });
  const u = URL.createObjectURL(blob);
  const l = document.createElement("a");
  l.href = u; l.download = "taxplot-data.json";
  document.body.appendChild(l); l.click(); l.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
  showToast(t("settings.toastDownloadStarted"));
}

document.addEventListener("click", (e) => {
  const nv = e.target.closest("[data-view]");
  if (nv) { showApp(nv.dataset.view); return; }
  const f = e.target.closest("[data-filter]");
  if (f) { STATE.receiptFilter = f.dataset.filter; renderApp(); return; }
  const s = e.target.closest("[data-set]");
  if (s) { setField(s.dataset.set, s.dataset.val, s.dataset.appearance === "1"); return; }
  const tg = e.target.closest("[data-toggle]");
  if (tg) { toggleField(tg.dataset.toggle, tg.dataset.appearance === "1"); return; }
  const a = e.target.closest("[data-act]");
  if (!a) return;
  const act = a.dataset.act;
  if (act === "hide") { SETTINGS.hideAmounts = !SETTINGS.hideAmounts; saveSettings(); applyAppearance(); renderApp(); showToast(SETTINGS.hideAmounts ? t("settings.toastAmountsHidden") : t("settings.toastAmountsShown")); }
  if (act === "goto-camera") gotoCamera();
  if (act === "enter-manually") enterManually();
  if (act === "goto-quickconfirm") show("s-quickconfirm");
  if (act === "export-pdf") exportPDF();
  if (act === "export-employer-pack") exportEmployerProofPack();
  if (act === "add-family-member") {
    const nameInput = el("set-family-name");
    addFamilyMember(nameInput.value, el("set-family-relation").value);
    renderApp();
  }
  if (act === "remove-family-member") { removeFamilyMember(a.dataset.id); renderApp(); }
  if (act === "reset-settings") resetSettings();
  if (act === "reset-demo") resetDemo();
  if (act === "export-data") exportData();
  if (act === "del") { STATE.confirmDelete = true; renderApp(); }
  if (act === "del-no") { STATE.confirmDelete = false; renderApp(); }
  if (act === "regime-optout-yes") { STATE.regime = STATE.confirmRegimeOptOut; STATE.confirmRegimeOptOut = false; renderApp(); }
  if (act === "regime-optout-no") { STATE.confirmRegimeOptOut = false; renderApp(); }
  if (act === "goto-glossary-library") { STATE.glossaryOpen = null; showApp("glossary"); }
  if (act === "open-glossary") { STATE.glossaryOpen = a.dataset.value; renderGlossarySheet(); }
  if (act === "close-glossary") { STATE.glossaryOpen = null; renderGlossarySheet(); }
  if (act === "read-aloud") speakGlossary(a.dataset.value);
  if (act === "del-yes") {
    STATE.confirmDelete = false;
    try { localStorage.removeItem(SETTINGS_KEY); } catch (err) {}
    Object.assign(SETTINGS, SETTINGS_DEFAULTS);
    applyAppearance();
    resetDemo();
    showToast(t("settings.toastDeleteDemo"));
  }
});

function setField(key, val, isAppearance) {
  if (isAppearance) { SETTINGS[key] = val; saveSettings(); applyAppearance(); renderApp(); return; }
  if (key === "regime") {
    // Task 4a: freelancers/business owners opting out of the new-regime
    // default can only switch back once, so confirm before applying.
    if (val !== "new" && STATE.regime === "new" && isFreelancerOrBusiness()) {
      STATE.confirmRegimeOptOut = val;
      renderApp();
      return;
    }
    STATE.confirmRegimeOptOut = false;
    STATE.regime = val;
    renderApp();
    return;
  }
  if (key === "age") { STATE.onboarding.section126.selfSenior = val === "senior"; renderApp(); return; }
}
function toggleField(key, isAppearance) {
  if (isAppearance) { SETTINGS[key] = !SETTINGS[key]; saveSettings(); applyAppearance(); renderApp(); return; }
  if (key === "parentsSenior") { STATE.onboarding.section126[key] = !STATE.onboarding.section126[key]; renderApp(); return; }
  if (key === "postFilingEVerified" || key === "postFilingRefund") {
    // Reassign a new object rather than mutating SETTINGS.postFiling in
    // place -- it can still be the same object SETTINGS_DEFAULTS.postFiling
    // points to (Object.assign only shallow-copies), and mutating it would
    // corrupt the shared default for the rest of the page's life.
    const field = key === "postFilingEVerified" ? "eVerified" : "refundReceived";
    SETTINGS.postFiling = { ...SETTINGS.postFiling, [field]: !SETTINGS.postFiling[field] };
    saveSettings();
    renderApp();
    return;
  }
  if (key === "autoDetectEnabled") {
    STATE.autoDetectEnabled = !STATE.autoDetectEnabled;
    if (STATE.autoDetectEnabled && STATE.pendingDetected.length === 0) STATE.pendingDetected = TaxEngine.DEMO_DETECTED_SEED.map((d) => ({ ...d }));
    renderApp();
    return;
  }
}
document.addEventListener("change", (e) => {
  if (e.target.id === "set-deadlineDays") { SETTINGS.deadlineDays = +e.target.value; saveSettings(); renderApp(); }
  if (e.target.id === "set-city") { STATE.onboarding.city = e.target.value.trim(); renderApp(); }
  if (e.target.id === "set-income") { const n = Number(e.target.value); STATE.income = n > 0 ? n : null; renderApp(); }
});

// ---------- Offline + share-in (task 6) ----------
// Set once loadSharedReceiptIfAny() resolves; consumed the next time the user
// reaches the app shell (see enableAutoDetect/skipAutoDetect) so a photo
// shared in from WhatsApp/gallery/email lands on the same camera "use this
// photo?" confirmation a regular capture does, instead of being dropped.
var PENDING_SHARED_PHOTO = null;
// Cache name must match sw.js's SHARE_CACHE -- the two sides of this hand-off
// have no API to look each other's constant up, so it's duplicated by hand.
const SHARE_CACHE_NAME = "taxplot-share-v1";
const SHARED_RECEIPT_KEY = "/shared-receipt";
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
function loadSharedReceiptIfAny() {
  if (!("caches" in window) || !location.search.includes("shared=1")) return;
  history.replaceState(null, "", location.pathname);
  caches.open(SHARE_CACHE_NAME)
    .then((cache) => cache.match(SHARED_RECEIPT_KEY).then((res) => {
      if (!res) return;
      cache.delete(SHARED_RECEIPT_KEY);
      return res.blob();
    }))
    .then((blob) => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = (e) => { PENDING_SHARED_PHOTO = e.target.result; };
      reader.readAsDataURL(blob);
    })
    .catch(() => {});
}

// ---------- Init ----------
function init() {
  applyAppearance();
  registerServiceWorker();
  loadSharedReceiptIfAny();
  show("s-onboarding");
}
document.addEventListener("DOMContentLoaded", init);

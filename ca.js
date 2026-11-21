/**
 * TaxPlot for CAs — ERP-style workspace prototype.
 * Shares style.css (Peacock tokens) and tax-engine.js (all slab/cap/rebate/
 * deadline figures — nothing tax-related is hardcoded here) with the
 * consumer app, but is its own page/script per the project's "plain
 * HTML/CSS/JS, no build step" scope.
 *
 * Compliance: a CA only sees a client's data after the client shares it
 * (consent, DPDP Act 2023) and can withdraw it any time. TaxPlot does not
 * file returns — filing stays in the CA's own software. Every client below
 * is FICTIONAL SAMPLE DATA for this prototype, clearly labelled as such in
 * the UI; wiring this to real client records needs a backend + ERI
 * registration for any filing feature (out of scope — see design/DESIGN.md).
 */
// ---------- i18n (prep only — not translated yet, see locales/en.json) ----------
// loadLocale/makeT come from locales/i18n.js, loaded before this file.
// var (not const) so t/CA_LOCALE land on window — see the matching note in app.js.
var CA_LOCALE = loadLocale("locales/en.json");
var t = makeT(CA_LOCALE.ca || {});

const CA_KEY = "taxplot.ca.settings";
const CA_DEFAULTS = { theme: "auto", density: "compact", text: "default", numFormat: "lakh", maskPan: true, shortcuts: true, sectionOrder: "new", lowConf: 80, plainWords: false };
const CS = Object.assign({}, CA_DEFAULTS, (() => { try { return JSON.parse(localStorage.getItem(CA_KEY) || "{}"); } catch (e) { return {}; } })());
function caSave() { try { localStorage.setItem(CA_KEY, JSON.stringify(CS)); } catch (e) {} }
function caApplyAppearance() {
  const r = document.documentElement;
  CS.theme === "auto" ? delete r.dataset.theme : (r.dataset.theme = CS.theme);
  CS.density === "compact" ? (r.dataset.density = "compact") : delete r.dataset.density;
  CS.text === "large" ? (r.dataset.text = "large") : delete r.dataset.text;
}
function caSet(k, v) { CS[k] = v; caSave(); caApplyAppearance(); caRender(); }

// ---------- tax math: every figure comes from TaxEngine (tax-engine.js) ----------
// Build the receipts array TaxEngine.compareRegimes() expects from a client's
// per-section totals, so the CA workspace runs through the exact same
// function app.js does — not a second, independently-maintained calculation
// that can silently drift out of sync with it (it used to, missing Section
// 133 donations entirely).
function clientReceipts(c) {
  const receipts = [];
  if (c.s123) receipts.push({ category: "PPF", amount: c.s123 });
  if (c.s124) receipts.push({ category: "NPS Tier I Contribution", amount: c.s124 });
  if (c.s126) receipts.push({ category: "Health Insurance — Self/Family", amount: c.s126 });
  if (c.s126p) receipts.push({ category: "Health Insurance — Parents", amount: c.s126p });
  if (c.s22) receipts.push({ category: "Home Loan Interest", amount: c.s22 });
  if (c.s133) receipts.push({ category: "Donation", amount: c.s133 });
  return receipts;
}
// True once anything is logged for the client (a deduction, HRA or a receipt). With nothing logged the
// regime comparison rests on income alone, so the UI says "not enough data" instead of naming a regime.
function caHasData(c) { return c.rc > 0 || [c.s123, c.s124, c.s126, c.s126p, c.s22, c.s133, c.hra].some((v) => v > 0); }
function caRegimeText(c, r) { return r.noData ? `<span class="muted">${t("clients.notEnoughData")}</span>` : `<b>${r.better}</b> <span class="muted num">${t("clients.byAmount", { amount: caInr(r.gap) })}</span>`; }
function regimeForClient(c) {
  // Client sample data stores a precomputed HRA exemption, not rent/city —
  // pass it straight through via exemptOverride instead of recomputing it.
  const cmp = TaxEngine.compareRegimes({
    grossIncome: c.inc,
    receipts: clientReceipts(c),
    hraContext: { exemptOverride: c.hra },
    section126Options: {},
  });
  return { old: cmp.oldTax, neu: cmp.newTax, better: cmp.betterRegime === "old" ? "Old" : "New", gap: cmp.savingsIfBetter, noData: !caHasData(c) };
}
// Regime-election consistency flag (NEXT_STEPS research item 4): informational only. Compares the regime on
// record with the engine estimate; never changes or submits an election.
function caElectionFlag(c) {
  if (c.rc === 0) return null;
  const r = regimeForClient(c);
  if (r.noData) return null;
  return r.gap > 0 && r.better !== c.elected ? r : null;
}
// Landlord-PAN completeness flag (research item 5): informational only. Threshold from TAX_CONFIG [VERIFY].
function caLandlordFlag(c) {
  return (c.hra > 0 || (c.flags && c.flags.rent)) && c.rent > TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent && !c.landlordPan;
}
function clientStatus(c) {
  if (c.rc === 0) return "none";
  if (c.rev > 0) return "check";
  const full = c.s123 >= TaxEngine.SECTION_CAPS.s123.cap && c.s126 >= TaxEngine.SECTION_CAPS.s126Self.capUnder60;
  return full ? "done" : "room";
}

// ---------- sample clients (FICTIONAL — for this prototype only) ----------
const CA_CLIENTS_RAW = [
  ["Ananya Rao", "AXRPR", "Salaried", 1800000, 112400, 50000, 18500, 96000, 420000, 10, 1, "2026-09-30"],
  ["Vikram Shetty", "BGSPS", "Salaried", 2400000, 150000, 50000, 25000, 200000, 0, 22, 0, "2026-09-28"],
  ["Farah Khan", "CQKPK", "Freelancer", 1250000, 46000, 0, 12000, 0, 96000, 7, 3, "2026-09-25"],
  ["Arjun Mehta", "DLMPM", "Salaried", 3200000, 150000, 50000, 25000, 180000, 240000, 31, 2, "2026-09-29"],
  ["Priya Nair", "EHNPN", "Gig worker", 640000, 12000, 0, 0, 0, 0, 3, 0, "2026-08-02"],
  ["Rohan Gupta", "FJGPG", "Salaried", 1500000, 98000, 20000, 25000, 0, 144000, 14, 4, "2026-09-30"],
  ["Sneha Kulkarni", "GKKPK", "Freelancer", 2100000, 150000, 50000, 18000, 0, 0, 18, 0, "2026-09-21"],
  ["Imran Sheikh", "HMSPS", "Salaried", 980000, 30000, 0, 8000, 0, 72000, 5, 1, "2026-07-14"],
  ["Meera Iyer", "JNIPI", "Salaried", 2750000, 150000, 35000, 25000, 200000, 600000, 27, 0, "2026-09-26"],
  ["Karan Malhotra", "KPMPM", "Freelancer", 1650000, 0, 0, 0, 0, 0, 0, 0, "—"],
  ["Divya Menon", "LQMPM", "Salaried", 1900000, 135000, 50000, 25000, 120000, 500000, 19, 2, "2026-09-27"],
  ["Siddharth Jain", "MRJPJ", "Gig worker", 820000, 24000, 0, 6000, 0, 0, 4, 1, "2026-09-03"],
  ["Neha Bansal", "NSBPB", "Salaried", 2250000, 150000, 50000, 21000, 160000, 150000, 24, 0, "2026-09-24"],
  ["Aditya Kapoor", "PTKPK", "Freelancer", 3600000, 150000, 50000, 25000, 200000, 0, 29, 5, "2026-09-30"],
];
// Section 126 (80D) parents' premiums, logged separately from self/family (own cap). FICTIONAL sample data.
const CA_PARENTS_126 = { "Ananya Rao": 18000, "Vikram Shetty": 25000, "Arjun Mehta": 22000, "Meera Iyer": 12000 };
// Donations logged (Section 133 (80G)) and rent on record, both FICTIONAL sample data: [annual rent, landlord PAN on file].
const CA_DONATIONS = { "Arjun Mehta": 25000, "Aditya Kapoor": 20000, "Vikram Shetty": 10000 };
const CA_RENT = { "Ananya Rao": [840000, true], "Farah Khan": [192000, false], "Arjun Mehta": [480000, false], "Rohan Gupta": [300000, true], "Imran Sheikh": [90000, false], "Meera Iyer": [960000, true], "Divya Menon": [720000, false], "Neha Bansal": [300000, false] };
// Regime each (fictional) client has on record; New is the default. Sample data for the consistency flag.
const CA_ELECTED = { "Ananya Rao": "Old", "Farah Khan": "Old", "Meera Iyer": "New" };
var C = CA_CLIENTS_RAW.map(([name, pan, type, inc, s123, s124, s126, s22, hra, rc, rev, last], i) => ({
  id: i + 1, elected: CA_ELECTED[name] || "New", s133: CA_DONATIONS[name] || 0, rent: (CA_RENT[name] || [0, false])[0], landlordPan: (CA_RENT[name] || [0, false])[1], name, pan: pan + (1000 + ((i * 397) % 9000)) + "K", type, inc, s123, s124, s126, s126p: CA_PARENTS_126[name] || 0, s22, hra, rc, rev, last,
}));
var Q = [
  { c: 3, who: "Health insurance premium", sec: "126", amt: 12000, conf: 62, d: "2026-09-25", field: "Amount", pay: "cash" },
  { c: 1, who: "Home loan interest · H1", sec: "22", amt: 96000, conf: 71, d: "2026-09-30", field: "Amount" },
  { c: 6, who: "ELSS SIP statement", sec: "123", amt: 24000, conf: 88, d: "2026-09-30", field: "Date" },
  { c: 6, who: "Tuition fee receipt", sec: "123", amt: 31000, conf: 93, d: "2026-09-29", field: "" },
  { c: 4, who: "Rent receipt · Sep", sec: "HRA", amt: 20000, conf: 76, d: "2026-09-29", field: "Landlord PAN" },
  { c: 14, who: "Donation receipt", sec: "133", amt: 25000, conf: 58, d: "2026-09-30", field: "50% or 100%", pay: "cash" },
  { c: 11, who: "NPS Tier I", sec: "124", amt: 10000, conf: 91, d: "2026-09-27", field: "" },
  { c: 2, who: "Health insurance premium · parents", sec: "126", parents: true, amt: 8000, conf: 80, d: "2026-09-26", field: "" },
  { c: 12, who: "Health check-up bill", sec: "126", amt: 4500, conf: 84, d: "2026-09-03", field: "Category", pay: "cash" },
].map((r, i) => ({ ...r, id: i + 1, state: "open" }));
// Post-extraction rule checks (task 5) ported to the CA queue, same engine
// functions app.js's checkReceiptRules() calls -- "Health check-up bill" is
// the one 126 item cash is still allowed for (isSection126CashDisallowed's
// "Preventive Health Checkup" exception), matched on its title since the
// queue doesn't have app.js's full category strings.
// Over-cap check (NEXT_STEPS 9.4): the client's logged total for this section already meets the cap,
// so another receipt adds nothing to the estimate. Caps come from TaxEngine, never typed here.
function caCapFlag(q) {
  const c = C.find((x) => x.id === q.c);
  const caps = { 123: ["s123", TaxEngine.SECTION_CAPS.s123.cap], 124: ["s124", TaxEngine.SECTION_CAPS.s124.cap], 126: q.parents ? ["s126p", TaxEngine.SECTION_CAPS.s126Parents.capUnder60] : ["s126", TaxEngine.SECTION_CAPS.s126Self.capUnder60], 22: ["s22", TaxEngine.SECTION_CAPS.s22.cap] }[q.sec];
  return c && caps && c[caps[0]] >= caps[1] ? t("queue.capFlag") : "";
}
// "Looks fine" = raises no flags under the rule checks (confidence at/above the user's setting, nothing to verify, no cash/over-cap flag).
// It only hides the row by default; the receipt stays open until the CA approves it. Nothing is auto-approved.
function caQFine(q) { return q.conf >= CS.lowConf && !q.field && !caRuleFlag(q); }
function caQVisible() { const open = Q.filter((q) => q.state === "open"); return caQShowAll ? open : open.filter((q) => !caQFine(q)); }
function caRuleFlag(q) { return caCashFlag(q) || caCapFlag(q); }
function caCashFlag(q) {
  if (q.pay !== "cash") return "";
  if (q.sec === "126") {
    const category = /check-?up/i.test(q.who) ? "Preventive Health Checkup" : "Health Insurance";
    return TaxEngine.isSection126CashDisallowed({ category, paymentMode: q.pay }) ? t("queue.cashFlag126") : "";
  }
  if (q.sec === "133") {
    return TaxEngine.isSection133CashDisallowed({ paymentMode: q.pay, amount: q.amt }) ? t("queue.cashFlag133") : "";
  }
  return "";
}
function syncReviewCounts() { C.forEach((c) => { c.rev = Q.filter((q) => q.c === c.id && q.state === "open").length; }); }
syncReviewCounts();

// ---------- documents checklist + bulk request (NEXT_STEPS task 9.1/9.2) ----------
// Which documents each client needs follows from their (fictional) profile; which
// ones they have already sent is SAMPLE data, spread deterministically so the
// prototype shows a mix. Real intake answers replace both once the backend exists.
const CA_DOC_KEYS = ["form130", "ais", "rent", "cert126", "cert126p", "homeLoan", "nps", "donation", "income"];
// Sample data: documents specific clients have not sent yet, on top of the spread rule below (keeps other clients stable).
const CA_DOCS_NOT_SENT = { "Arjun Mehta": ["donation"] };
// ---------- Review decisions + document ticks kept on this device (audit #1, #2) ----------
// Review decisions (Q states) and the review record (AUDIT) are saved so a reload keeps them and the
// Year in review / readiness record stay right. Document ticks are the CA's own manual marks for imported clients.
const CA_REVIEW_KEY = "taxplot.ca.review", CA_DOCS_KEY = "taxplot.ca.docsGot";
var caDocsGot = {}; // { [clientId]: { [docKey]: true } } set by the CA; var for tests
function caReviewSave() {
  try { localStorage.setItem(CA_REVIEW_KEY, JSON.stringify({ q: Q.filter((q) => q.state !== "open").map((q) => [q.id, q.state]), audit: AUDIT.slice(-2000) })); } catch (e) {}
}
function caReviewLoad() {
  let o = null; try { o = JSON.parse(localStorage.getItem(CA_REVIEW_KEY) || "null"); } catch (e) {}
  if (!o || typeof o !== "object") return;
  const states = ["approve", "query", "reject"];
  (Array.isArray(o.q) ? o.q : []).forEach((p) => { const q = Array.isArray(p) && Q.find((x) => x.id === p[0]); if (q && states.includes(p[1])) q.state = p[1]; });
  (Array.isArray(o.audit) ? o.audit : []).forEach((a) => {
    if (a && Number.isInteger(a.c) && states.includes(a.type) && Number.isFinite(a.at)) AUDIT.push({ c: a.c, type: a.type, user: String(a.user || "").slice(0, 60), at: a.at, reason: String(a.reason || "").slice(0, 500), what: String(a.what || "").slice(0, 200), sec: Object.prototype.hasOwnProperty.call(OLD_SEC_NO, a.sec) || a.sec === "HRA" ? String(a.sec) : "", flag: String(a.flag || "").slice(0, 300) });
  });
}
function caDocsSave() { try { localStorage.setItem(CA_DOCS_KEY, JSON.stringify(caDocsGot)); } catch (e) {} }
function caDocsLoad() {
  caDocsGot = {};
  try {
    const o = JSON.parse(localStorage.getItem(CA_DOCS_KEY) || "{}");
    if (o && typeof o === "object") Object.keys(o).forEach((id) => { const m = o[id]; if (m && typeof m === "object") { caDocsGot[id] = {}; CA_DOC_KEYS.forEach((k) => { if (m[k] === true) caDocsGot[id][k] = true; }); } });
  } catch (e) {}
}
function caDocsToggle(id, key) {
  if (!CA_DOC_KEYS.includes(key)) return;
  const m = caDocsGot[id] || (caDocsGot[id] = {});
  if (m[key]) delete m[key]; else m[key] = true;
  caDocsSave();
}
function clientDocs(c) {
  const need = [], f = c.flags || {}; // f = intake flags from an imported client (no amounts known yet)
  if (c.type === "Salaried") need.push("form130");
  need.push("ais");
  if (c.hra > 0 || f.rent) need.push("rent");
  if (c.s126 > 0 || f.health) need.push("cert126");
  if (c.s126p > 0 || f.parentsHealth) need.push("cert126p");
  if (c.s22 > 0 || f.homeLoan) need.push("homeLoan");
  if (c.s124 > 0 || f.nps) need.push("nps");
  if (c.s133 > 0 || f.donations) need.push("donation");
  if (c.type !== "Salaried") need.push("income");
  // Imported clients: only what the CA has ticked by hand. The pseudo-random spread below is for fictional sample clients only.
  const got = c.imported ? need.filter((d) => (caDocsGot[c.id] || {})[d]) : need.filter((d) => c.rc > 0 && !(CA_DOCS_NOT_SENT[c.name] || []).includes(d) && (c.id * 2 + CA_DOC_KEYS.indexOf(d)) % 6 !== 0);
  return { need, got, missing: need.filter((d) => !got.includes(d)) };
}
function caWaLink(c, docKeys) {
  const docs = docKeys.map((d) => t("docs." + d)).join("; ");
  return "https://wa.me/?text=" + encodeURIComponent(t("bulk.messageOne", { name: c.name.split(" ")[0], fy: TaxEngine.FY_LABEL, docs }));
}
function caDueDate(key) { const dl = TaxEngine.DEADLINES.find((x) => x.key === key); return dl ? new Date(dl.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""; }
function clientReturn(c) {
  const key = c.type === "Salaried" ? "itr12" : "itr34";
  const dl = TaxEngine.DEADLINES.find((x) => x.key === key);
  const date = dl ? new Date(dl.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  return { key, form: t("returns." + key), date, text: t("returns.cell", { form: t("returns." + key), date }) };
}
// Greeting follows the viewer's local hour (it was hard-wired to "evening").
function caGreetingKey() { const h = new Date().getHours(); return h < 12 ? "dash.greetingMorning" : h < 17 ? "dash.greetingAfternoon" : "dash.greetingEvening"; }
function caDays(d) { return Math.round((new Date(d.date) - TODAY) / 864e5); }
function caDeadlineChip(days) { return days < 0 ? chip("none", t("deadlines.passed")) : chip(days <= 45 ? "soon" : "room", days <= 45 ? t("deadlines.actSoon") : t("deadlines.upcoming")); }

// Local calendar date (the device's own clock, not UTC) as YYYY-MM-DD.
function caLocalISO(d = new Date()) { const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
// Real today (midnight, local calendar date) so deadline countdowns are live. For demos/tests, ?today=YYYY-MM-DD overrides it.
const TODAY = (() => {
  const q = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search);
  const d = q ? new Date(q[1]) : new Date(caLocalISO());
  return isNaN(d) ? new Date(caLocalISO()) : d;
})();

// ---------- helpers ----------
function caInr(n) { return "₹" + Math.round(n).toLocaleString(CS.numFormat === "intl" ? "en-US" : "en-IN"); }
function caPan(p) { /* one format everywhere: XXXXXX + last 4. Imported PANs are stored already masked (last 4 only). */ return (CS.maskPan || /^[•X]/.test(p)) ? caMaskPan4(p) : p; }
const OLD_SEC_NO = { 123: "80C", 124: "80CCD(1B)", 126: "80D", 22: "24(b)", 133: "80G" };
function caSec(n) {
  if (n === "HRA") return "HRA";
  if (!Object.prototype.hasOwnProperty.call(OLD_SEC_NO, n)) return caEsc(n); // restored/unknown value: never raw HTML
  const base = CS.sectionOrder === "old" ? `${OLD_SEC_NO[n]} (Sec ${n})` : `Sec ${n} (${OLD_SEC_NO[n]})`;
  return CS.plainWords ? `${base} — ${t("secPlain." + n)}` : base;
}

const CA_ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.8-3.2 3.2-4.8 6-4.8s5.2 1.6 6 4.8"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.9c1.9.5 3.1 2 3.5 4.6"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17z"/><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  report: '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.9v.2"/>',
  dash: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  up: '<path d="M12 20V9M7 13.5l5-5 5 5M5 4h14"/>',
  note: '<path d="M6 3.5h9l3.5 3.5V20.5H6z"/><path d="M14.5 3.5V7.5h4M9 12h6M9 15.5h6"/>',
  sort: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
};
function ic(n) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CA_ICONS[n] || ""}</svg>`; }
const CA_STATUS = { done: [t("status.done"), "check", "st-done"], room: [t("status.room"), "clock", "st-room"], soon: [t("status.soon"), "alert", "st-soon"], none: [t("status.none"), "dash", "st-none"], check: [t("status.check"), "eye", "st-check"] };
function chip(k, label) { return `<span class="chip ${CA_STATUS[k][2]}">${ic(CA_STATUS[k][1])}${label || CA_STATUS[k][0]}</span>`; }
function mm(u, cap) { const st = u >= cap ? "done" : u === 0 ? "none" : "room"; return `<div class="mm"><div class="meter ${st}">${st === "none" ? "" : `<i style="width:${Math.min(100, (u / cap) * 100)}%"></i>`}</div><span>${Math.round((Math.min(u, cap) / cap) * 100)}%</span></div>`; }

const CA_DISC = `<p class="disc">${ic("info")}${t("common.disclaimer")}</p>`;

// ---------- state ----------
const CA_NAV = [[t("nav.groupPractice"), [["dash", "home", t("nav.dashboard")], ["clients", "users", t("nav.clients")], ["import", "up", t("nav.import")], ["invite", "users", t("nav.invite")], ["queue", "inbox", t("nav.queue")]]], [t("nav.groupWork"), [["deadlines", "cal", t("nav.deadlines")], ["notices", "note", t("nav.notices")], ["status", "eye", t("nav.status")], ["plan", "check", t("nav.plan")], ["rules", "msg", t("nav.rules")], ["season", "report", t("nav.season")], ["reports", "report", t("nav.reports")]]], [t("nav.groupFirm"), [["settings", "gear", t("nav.settings")]]]];
var AUDIT = [];
var caReason = "";
const CA_USER = "Ritu M.";
let caQShowAll = false;
let caBulk = "", caRoom = "", caView = "clients", caSel = 1, caFilt = "all", caSortKey = "name", caSortDir = 1, caQuery = "", caQSel = 1;

// ---------- views ----------
function caDocsText(c) { const d = clientDocs(c); return d.need.length ? t("clients.docsCount", { got: d.got.length, need: d.need.length }) : t("clients.docsNone"); }
function caDocsCell(c) { const d = clientDocs(c); return d.need.length ? mm(d.got.length, d.need.length).replace(/<span>\d+%<\/span>/, `<span class="num">${caDocsText(c)}</span>`) : `<span class="muted">${caDocsText(c)}</span>`; }
function caBulkPanel() {
  const counts = CA_DOC_KEYS.map((k) => [k, C.filter((c) => clientDocs(c).missing.includes(k))]);
  const chips = counts.map(([k, list]) => `<button class="fchip" type="button" data-bulk="${k}" aria-pressed="${caBulk === k}">${t("bulk.chip", { doc: t("docs." + k).split(/ [(—]/)[0], n: list.length })}</button>`).join("");
  const sel = counts.find(([k]) => k === caBulk);
  const list = !sel ? "" : sel[1].length ? `<p class="muted" style="font-size:.84rem">${t("bulk.listHeader", { n: sel[1].length, doc: t("docs." + sel[0]) })}</p><div class="bulk-list">${sel[1].map((c) => `<div class="row"><span>${caEsc(c.name)}</span><a class="btn ghost sm" href="${caWaLink(c, [sel[0]])}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("bulk.ask")}</a></div>`).join("")}</div><p class="muted" style="font-size:.78rem">${t("bulk.note")}</p>` : `<p class="muted">${t("bulk.none")}</p>`;
  return `<section class="cardx bulk"><header><h2>${t("bulk.title")}</h2><p>${t("bulk.sub")}</p></header><div class="fbar">${chips}</div>${list}</section>`;
}
// ---------- Chasing rules (Turia research item 1) ----------
// CONFIG BLOCK: every rule and day count lives here, never in the views. Rules are plain
// if-then checks over data already on screen. Nothing runs on a timer and nothing is sent:
// a match only produces a wa.me link the CA opens and sends. (Tax figures stay in TAX_CONFIG.)
const CA_RULES_CONFIG = {
  order: ["missingDoc", "unanswered", "flagged"],
  missingDoc: { on: true, withinDays: 60, windowOptions: [30, 60, 90, 180, 365] },
  unanswered: { on: true, afterDays: 3 },
  flagged: { on: true },
};
// SAMPLE data (fictional): document requests the CA has already sent, [client, document, days ago].
// A request only counts while that document is still missing.
const CA_REQUESTS_SAMPLE = [["Arjun Mehta", "donation", 5], ["Rohan Gupta", "nps", 4], ["Imran Sheikh", "rent", 3], ["Meera Iyer", "form130", 2]];
let caRuleWin = null, caSeasonFilt = "all";
function caRuleWindow() { return caRuleWin || CA_RULES_CONFIG.missingDoc.withinDays; }
function caClientDays(c) { const dl = TaxEngine.DEADLINES.find((x) => x.key === clientReturn(c).key); return dl ? caDays(dl) : null; }
function caRuleMatches(id) {
  const cfg = CA_RULES_CONFIG[id], fy = TaxEngine.FY_LABEL;
  if (!cfg || !cfg.on) return [];
  if (id === "missingDoc") {
    return C.map((c) => ({ c, days: caClientDays(c), missing: clientDocs(c).missing })).filter((m) => m.missing.length && m.days !== null && m.days <= caRuleWindow())
      .sort((a, b) => a.days - b.days).map((m) => {
        const short = m.missing.map((d) => t("docs." + d).split(/ [(—]/)[0]).join(", ");
        const docs = m.missing.map((d) => t("docs." + d)).join("; ");
        const msg = t("rules.missingDoc.message", { name: m.c.name.split(" ")[0], fy, docs, date: clientReturn(m.c).date });
        return { c: m.c, text: m.days < 0 ? t("rules.missingDoc.rowPassed", { docs: short, days: -m.days }) : t("rules.missingDoc.row", { docs: short, days: m.days }), link: "https://wa.me/?text=" + encodeURIComponent(msg), btn: "open" };
      });
  }
  if (id === "unanswered") {
    return CA_REQUESTS_SAMPLE.map(([name, doc, ago]) => ({ c: C.find((x) => x.name === name), doc, ago })).filter((r) => r.c && r.ago >= cfg.afterDays && clientDocs(r.c).missing.includes(r.doc))
      .sort((a, b) => b.ago - a.ago).map((r) => ({ c: r.c, text: t("rules.unanswered.row", { doc: t("docs." + r.doc).split(/ [(—]/)[0], days: r.ago }), link: "https://wa.me/?text=" + encodeURIComponent(t("rules.unanswered.message", { name: r.c.name.split(" ")[0], days: r.ago, docs: t("docs." + r.doc), fy })), btn: "followUp" }));
  }
  if (id === "flagged") {
    return Q.filter((q) => q.state === "open" && caRuleFlag(q)).map((q) => { const c = C.find((x) => x.id === q.c); return { c, text: t("rules.flagged.row", { receipt: q.who, flag: caRuleFlag(q) }), link: "https://wa.me/?text=" + encodeURIComponent(t("rules.flagged.message", { name: c.name.split(" ")[0], fy, receipt: q.who, flag: caRuleFlag(q) })), btn: "tell" }; });
  }
  return [];
}
function caRulesView() {
  const win = CA_RULES_CONFIG.missingDoc.windowOptions.map((n) => `<button class="fchip" type="button" data-rulewin="${n}" aria-pressed="${caRuleWindow() === n}">${t("rules.windowDays", { n })}</button>`).join("");
  const params = { missingDoc: { n: caRuleWindow() }, unanswered: { n: CA_RULES_CONFIG.unanswered.afterDays }, flagged: {} };
  const cards = CA_RULES_CONFIG.order.filter((id) => CA_RULES_CONFIG[id] && CA_RULES_CONFIG[id].on).map((id) => {
    const hits = caRuleMatches(id);
    const rows = hits.length ? hits.map((h) => `<div class="row"><div><span class="lbl">${caEsc(h.c.name)}</span><p class="help">${caEsc(h.text)}</p></div><a class="btn ghost sm" href="${h.link}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("rules." + h.btn)}</a></div>`).join("") : `<p class="muted">${t("rules.none")}</p>`;
    return `<section class="cardx" data-rule="${id}"><header><h2>${t("rules." + id + ".name")} <span class="pill">${t("rules.countMatches", { n: hits.length })}</span></h2><p>${t("rules." + id + ".text", params[id])}</p></header>${id === "missingDoc" ? `<div class="fbar"><span class="muted" style="font-size:.8rem">${t("rules.windowLabel")}</span>${win}</div>` : ""}${rows}</section>`;
  }).join("");
  return `<div class="ph"><h1>${t("rules.title")}</h1><span class="pill">${t("common.sampleData")}</span></div><p class="muted" style="font-size:.86rem">${t("rules.sub")}</p>${cards}<div class="note-box">${ic("info")}<span>${t("rules.note")}</span></div>${CA_DISC}`;
}

// ---------- Season readiness report (Turia research item 4) ----------
// Clients still missing documents, grouped by likely return due date. Readiness % is an estimate
// (documents on file / documents needed), shown as such. CSV and PDF carry the disclaimer footer.
function caSeasonRows() {
  return C.filter((c) => caSeasonFilt === "all" || clientReturn(c).key === caSeasonFilt).map((c) => {
    const d = clientDocs(c), r = clientReturn(c);
    return { c, form: r.form, date: r.date, days: caClientDays(c), got: d.got.length, need: d.need.length, pct: d.need.length ? Math.round((100 * d.got.length) / d.need.length) : 100, missing: d.missing.map((k) => t("docs." + k).split(/ [(—]/)[0]) };
  }).sort((a, b) => (a.days - b.days) || (a.pct - b.pct) || a.c.name.localeCompare(b.c.name));
}
function buildSeasonReportData(now = Date.now()) {
  const rows = caSeasonRows(), out = rows.filter((r) => r.missing.length);
  const docs = out.reduce((n, r) => n + r.missing.length, 0);
  const time = new Date(now).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return {
    title: t("season.title2", { fy: TaxEngine.FY_LABEL }), generated: t("season.generated", { time, who: CA_USER }),
    summary: t("season.summary", { ready: rows.length - out.length, total: rows.length, docs, missing: out.length }),
    head: [t("season.colClient"), t("season.colReturn"), t("season.colDays"), t("season.colReadiness"), t("season.colMissing")],
    body: out.map((r) => [r.c.name, `${r.form} · ${r.date}`, r.days === null ? "" : String(r.days), r.pct + "%", r.missing.join("; ")]),
    footer: t("season.footer"), filename: "TaxPlot_Season_Readiness_" + TaxEngine.FY_LABEL.replace(/[^0-9A-Za-z]+/g, "-") + ".",
  };
}
function caCsvCell(v) { let s = String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function caSeasonCsv(data) { return [[data.title], [data.generated], [data.summary], [], data.head, ...data.body, [], [data.footer]].map((r) => r.map(caCsvCell).join(",")).join("\r\n") + "\r\n"; }
function caExportSeasonCsv() {
  const data = buildSeasonReportData();
  const url = URL.createObjectURL(new Blob(["﻿" + caSeasonCsv(data)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = data.filename + "csv"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); caToast(t("season.csvDone"));
}
function caDownloadCsv(rows, filename) {
  const text = rows.map((r) => r.map(caCsvCell).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); caToast(t("season.csvDone"));
}
async function caExportSeasonPdf() {
  const data = buildSeasonReportData();
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) await caLoadScript(CA_PDF_LIBS.jspdf);
    if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await caLoadScript(CA_PDF_LIBS.autotable);
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    let y = 50;
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, 40, y); y += 20;
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.text(data.generated, 40, y); y += 16;
    const sm = doc.splitTextToSize(data.summary, 515); doc.text(sm, 40, y); y += sm.length * 12 + 10;
    doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, head: [data.head], body: data.body, theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } });
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(data.footer, 40, 810, { maxWidth: 515 }); doc.setTextColor(0); }
    doc.save(data.filename + "pdf");
  } catch (e) { console.error("Season readiness PDF failed:", e); caToast(t("season.failed")); }
}
function caSeasonView() {
  const rows = caSeasonRows(), out = rows.filter((r) => r.missing.length), docs = out.reduce((n, r) => n + r.missing.length, 0);
  const need = rows.reduce((n, r) => n + r.need, 0), got = rows.reduce((n, r) => n + r.got, 0);
  const f = [["all", t("season.filterAll")], ["itr12", t("season.filterDue", { date: caDueDate("itr12") })], ["itr34", t("season.filterDue", { date: caDueDate("itr34") })]];
  const kpi = (l, v) => `<div class="kpi"><span class="eyebrow">${l}</span><b class="num">${v}</b></div>`;
  const dayTxt = (r) => (r.days === null ? "" : r.days < 0 ? t("deadlines.passed") : t("dash.daysLabel", { n: r.days }));
  return `<div class="ph"><h1>${t("season.title")}</h1><span class="pill">${t("season.sample")}</span><button class="btn ghost" type="button" data-season-export="csv">${ic("down")}${t("season.csv")}</button><button class="btn" type="button" data-season-export="pdf">${ic("down")}${t("season.pdf")}</button></div>
  <p class="muted" style="font-size:.86rem">${t("season.sub")}</p>
  <div class="fbar">${f.map(([k, l]) => `<button class="fchip" type="button" data-season="${k}" aria-pressed="${caSeasonFilt === k}">${l}</button>`).join("")}</div>
  <div class="kpis">${kpi(t("season.kpiReady"), rows.length - out.length + " / " + rows.length)}${kpi(t("season.kpiMissing"), out.length)}${kpi(t("season.kpiDocs"), docs)}${kpi(t("season.kpiReadiness"), (need ? Math.round((100 * got) / need) : 100) + "%")}</div>
  ${out.length ? `<div class="grid" style="max-height:none"><table><thead><tr><th>${t("season.colClient")}</th><th>${t("season.colReturn")}</th><th class="r">${t("season.colDays")}</th><th class="r">${t("season.colReadiness")}</th><th>${t("season.colMissing")}</th></tr></thead><tbody>${out.map((r) => `<tr><td class="cname">${caEsc(r.c.name)}</td><td>${r.form} · ${r.date}</td><td class="r num">${r.days === null ? "" : r.days}</td><td class="r num">${r.pct}%</td><td>${caEsc(r.missing.join("; "))}</td></tr>`).join("")}</tbody></table></div>
  <div class="cards" role="list" aria-label="${t("season.title")}">${out.map((r) => `<article class="ccard" role="listitem"><div class="h"><b>${caEsc(r.c.name)}</b><span class="num">${r.pct}%</span></div><span class="sub">${r.form} · ${r.date} · ${dayTxt(r)}</span><span class="muted sub">${caEsc(r.missing.join("; "))}</span></article>`).join("")}</div>` : `<p class="muted">${t("season.none")}</p>`}
  ${CA_DISC}`;
}
// ---------- "Room left" campaign (NEXT_STEPS 9.7) ----------
// Per-client room under each section, one factual nudge each (or one generic message for all).
// Wording states facts only and never suggests products. Caps come from TaxEngine.
function caRoomSecs() {
  const S = TaxEngine.SECTION_CAPS;
  return [["123", "s123", S.s123.cap, "123"], ["124", "s124", S.s124.cap, "124"], ["126", "s126", S.s126Self.capUnder60, "126", "gloss126self"], ["126", "s126p", S.s126Parents.capUnder60, "126", "gloss126parents", true], ["22", "s22", S.s22.cap, "22", "", true]]
    .map(([n, key, cap, , gloss, needsLogged]) => ({ id: key, n, key, cap, gloss, needsLogged }));
}
function caRoomName(s) { return caEvSecName(s.n) + (s.gloss ? " — " + t("detail." + s.gloss) : ""); }
function caRoomList(s) { return C.filter((c) => c.rc > 0 && regimeForClient(c).better === "Old" && c[s.key] < s.cap && (!s.needsLogged || c[s.key] > 0)); }
function caRoomMsg(c, s) { return t("room.messageOne", { name: c.name.split(" ")[0], fy: TaxEngine.FY_LABEL, amount: caInr(s.cap - c[s.key]), sec: caRoomName(s), cap: caInr(s.cap) }); }
// ---------- Advisory opportunities (research item 5) ----------
// Extends "Room left": per old-regime client, estimated rupee effect of (a) unused cap room, (b) parents' health insurance
// not yet logged, (c) rent over the landlord-PAN threshold with no landlord PAN. Every figure comes from TaxEngine
// (caps, threshold and the tax calculation); estimates only, the CA decides what to raise with the client.
const CA_OPP_CATEGORY = { s123: "PPF", s124: "NPS Tier I Contribution", s126: "Health Insurance — Self/Family", s126p: "Health Insurance — Parents", s22: "Home Loan Interest" };
function caOppRound(n) { const step = TaxEngine.TAX_CONFIG.receiptSavingRoundRupees || 1; return Math.max(0, Math.round(n / step) * step); }
function caOppOldTax(c, extra, hra) {
  return TaxEngine.compareRegimes({ grossIncome: c.inc, receipts: clientReceipts(c).concat(extra || []), hraContext: { exemptOverride: hra === undefined ? c.hra : hra }, section126Options: {} }).oldTax;
}
function caOppList() {
  const out = [], base = new Map();
  C.filter((c) => c.rc > 0 && regimeForClient(c).better === "Old").forEach((c) => {
    base.set(c.id, caOppOldTax(c));
    const add = (kind, sec, room, extra) => { const value = caOppRound(base.get(c.id) - caOppOldTax(c, extra)); if (value > 0) out.push({ c, kind, sec, room, value }); };
    caRoomSecs().forEach((s) => {
      if (c[s.key] >= s.cap) return;
      const room = s.cap - c[s.key];
      if (s.key === "s126p" && c.s126p === 0) return;
      if (s.needsLogged && !(c[s.key] > 0)) return;
      add("room", s, room, [{ category: CA_OPP_CATEGORY[s.key], amount: room }]);
    });
    const par = caRoomSecs().find((s) => s.key === "s126p");
    if (!(c.s126p > 0)) add("parents", par, par.cap, [{ category: CA_OPP_CATEGORY.s126p, amount: par.cap }]);
    if (caLandlordFlag(c)) { const v = caOppRound(caOppOldTax(c, [], 0) - base.get(c.id)); if (v > 0) out.push({ c, kind: "landlord", sec: null, room: 0, value: v }); }
  });
  return out.sort((a, b) => b.value - a.value);
}
function caOppPanel() {
  const rows = caOppList();
  const what = (r) => r.kind === "landlord" ? t("opp.kindLandlord", { rent: caInr(r.c.rent), threshold: caInr(TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent) }) : r.kind === "parents" ? t("opp.kindParents", { sec: caRoomName(r.sec), cap: caInr(r.room) }) : t("opp.kindRoom", { sec: caRoomName(r.sec), amount: caInr(r.room) });
  const body = rows.length ? `<div class="bulk-list">${rows.map((r) => `<div class="row" data-opp="${r.c.id}"><span>${caEsc(r.c.name)} <span class="muted num">${t("opp.pan", { pan: caMaskPan4(r.c.pan) })}</span><br><span class="muted" style="font-size:.84rem">${what(r)}</span></span><span class="num" data-opp-value>${t("opp.value", { amount: caInr(r.value) })}</span></div>`).join("")}</div>` : `<p class="muted">${t("opp.none")}</p>`;
  return `<section class="cardx bulk opp"><header><h2>${t("opp.title")}</h2><p>${t("opp.sub")}</p></header>${body}<p class="muted" style="font-size:.78rem;padding:.2rem 1rem .6rem">${t("opp.note")}</p></section>`;
}
function caRoomPanel() {
  const secs = caRoomSecs(), sel = secs.find((s) => s.id === caRoom);
  const chips = secs.map((s) => `<button class="fchip" type="button" data-room="${s.id}" aria-pressed="${caRoom === s.id}">${t("room.chip", { sec: caRoomName(s), n: caRoomList(s).length })}</button>`).join("");
  let list = "";
  if (sel) {
    const rows = caRoomList(sel).sort((a, b) => (sel.cap - b[sel.key]) - (sel.cap - a[sel.key]));
    const wa = (txt) => "https://wa.me/?text=" + encodeURIComponent(txt);
    list = rows.length ? `<p class="muted" style="font-size:.84rem">${t("room.listHeader", { n: rows.length, sec: caRoomName(sel) })}</p><div class="bulk-list">${rows.map((c) => `<div class="row"><span>${caEsc(c.name)} <span class="muted num">${t("room.row", { amount: caInr(sel.cap - c[sel.key]), cap: caInr(sel.cap) })}</span></span><a class="btn ghost sm" href="${wa(caRoomMsg(c, sel))}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("room.ask")}</a></div>`).join("")}</div><div style="padding:.2rem 1rem .4rem"><a class="btn sm" data-roomall href="${wa(t("room.messageAll", { fy: TaxEngine.FY_LABEL, sec: caRoomName(sel), cap: caInr(sel.cap) }))}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("room.bulkAsk", { n: rows.length })}</a></div><p class="muted" style="font-size:.78rem">${t("room.bulkNote")}</p>` : `<p class="muted">${t("room.none")}</p>`;
  }
  return `<section class="cardx bulk room"><header><h2>${t("room.title")}</h2><p>${t("room.sub")}</p></header><div class="fbar">${chips}</div>${secs.every((x) => !caRoomList(x).length) ? `<p class="muted" style="font-size:.84rem">${t("room.noneOldRegime")}</p>` : ""}${list}</section>`;
}
function caClientTable() {
  let rows = C.filter((c) => (caFilt === "all" || (caFilt === "docs" ? clientDocs(c).missing.length > 0 : caFilt === "landlord" ? caLandlordFlag(c) : caFilt === "election" ? !!caElectionFlag(c) : caFilt === "itr12" || caFilt === "itr34" ? clientReturn(c).key === caFilt : clientStatus(c) === caFilt || c.type === caFilt)) && (!caQuery || (c.name + c.pan).toLowerCase().includes(caQuery.toLowerCase())));
  rows.sort((a, b) => { const va = caSortKey === "regime" ? regimeForClient(a).gap : a[caSortKey], vb = caSortKey === "regime" ? regimeForClient(b).gap : b[caSortKey]; return (va > vb ? 1 : va < vb ? -1 : 0) * caSortDir; });
  const th = (k, label, cls = "") => `<th class="${cls}"><button type="button" data-sort="${k}" ${caSortKey === k ? `aria-sort="${caSortDir > 0 ? "ascending" : "descending"}"` : ""}>${label}${caSortKey === k ? ic("sort") : ""}</button></th>`;
  const f = [["all", t("clients.filterAll")], ["check", t("clients.filterCheck")], ["room", t("clients.filterRoom")], ["done", t("clients.filterDone")], ["none", t("clients.filterNone")], ["Salaried", t("clients.filterSalaried")], ["Freelancer", t("clients.filterFreelancer")], ["Gig worker", t("clients.filterGig")], ["docs", t("clients.filterDocs")], ["election", t("election.filter")], ["landlord", t("landlord.filter")], ["itr12", t("clients.filterDue", { date: caDueDate("itr12") })], ["itr34", t("clients.filterDue", { date: caDueDate("itr34") })]];
  return `<div class="fbar">${f.map(([k, label]) => `<button class="fchip" type="button" data-filt="${k}" aria-pressed="${caFilt === k}">${label}</button>`).join("")}<span class="count">${t("clients.countSummary", { shown: rows.length, total: C.length })}</span></div>
  <p class="muted" style="font-size:.78rem;margin:.1rem 0 .5rem" data-regime-note>${t("clients.regimeEstimateNote")} ${t("returns.note")} ${t("election.note")} ${t("landlord.note")}</p>
  <div class="grid" role="region" aria-label="Clients"><table><thead><tr><th><input type="checkbox" class="chk" aria-label="${t("clients.selectAllAria")}"></th>${th("name", t("clients.colClient"))}<th>${t("clients.colPan")}</th>${th("inc", t("clients.colIncome"), "r")}${th("regime", t("clients.colLowerRegime"))}<th>${caSec("123")}</th><th>${caSec("126")}<div class="muted" style="font-weight:400;font-size:.72rem">${t("clients.col126split")}</div></th><th>${caSec("124")}</th><th>${t("clients.colDocs")}</th><th>${t("clients.colReturn")}</th>${th("rc", t("clients.colReceipts"), "r")}${th("rev", t("clients.colToReview"), "r")}<th>${t("clients.colStatus")}</th>${th("last", t("clients.colLastUpload"))}</tr></thead><tbody>
  ${rows.map((c) => { const r = regimeForClient(c); return `<tr data-row="${c.id}" aria-selected="${caSel === c.id}"><td><input type="checkbox" class="chk" aria-label="${t("clients.selectClientAria", { name: caEsc(c.name) })}"></td><td class="cname">${caEsc(c.name)}<small>${c.type}${c.imported ? " · " + t("import.importedChip") : ""}</small></td><td class="pan">${caPan(c.pan)}</td><td class="r num">${caInr(c.inc)}</td><td class="reg">${caRegimeText(c, r)}${caElectionFlag(c) ? `<div>${chip("check", t("election.chip"))}</div>` : ""}</td><td>${mm(c.s123, TaxEngine.SECTION_CAPS.s123.cap)}</td><td><div title="${t("detail.gloss126self")}">${mm(c.s126, TaxEngine.SECTION_CAPS.s126Self.capUnder60)}</div><div title="${t("detail.gloss126parents")}">${mm(c.s126p, TaxEngine.SECTION_CAPS.s126Parents.capUnder60)}</div></td><td>${mm(c.s124, TaxEngine.SECTION_CAPS.s124.cap)}</td><td>${caDocsCell(c)}${caLandlordFlag(c) ? `<div>${chip("check", t("landlord.chip"))}</div>` : ""}</td><td class="num">${clientReturn(c).text}</td><td class="r num">${c.rc}</td><td class="r num" style="${c.rev ? "color:var(--warn);font-weight:600" : ""}">${c.rev || "–"}</td><td>${chip(clientStatus(c))}</td><td class="num muted">${c.last === "—" ? "—" : new Date(c.last).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="cards" role="list" aria-label="${t("clients.title")}">${rows.map((c) => { const r = regimeForClient(c); return `<button type="button" class="ccard" role="listitem" data-row="${c.id}" aria-pressed="${caSel === c.id}"><span class="h"><b>${caEsc(c.name)}</b>${chip(clientStatus(c))}</span><span class="muted sub">${c.type}${c.imported ? " · " + t("import.importedChip") : ""} · <span class="pan">${caPan(c.pan)}</span></span>${caElectionFlag(c) ? `<span>${chip("check", t("election.chip"))}</span>` : ""}${caLandlordFlag(c) ? `<span>${chip("check", t("landlord.chip"))}</span>` : ""}<span class="kv"><span><span class="eyebrow">${t("clients.colIncome")}</span><span class="num">${caInr(c.inc)}</span></span><span><span class="eyebrow">${t("clients.colLowerRegime")}</span><span>${caRegimeText(c, r)}</span></span><span><span class="eyebrow">${t("clients.colDocs")}</span><span class="num">${caDocsText(c)}</span></span><span><span class="eyebrow">${t("clients.colReturn")}</span><span class="num">${clientReturn(c).text}</span></span><span><span class="eyebrow">${t("clients.colReceipts")}</span><span class="num">${c.rc}</span></span><span><span class="eyebrow">${t("clients.colToReview")}</span><span class="num" style="${c.rev ? "color:var(--warn);font-weight:600" : ""}">${c.rev || "–"}</span></span></span></button>`; }).join("")}</div>`;
}
function caKpis() {
  const rev = Q.filter((q) => q.state === "open").length, room = C.filter((c) => clientStatus(c) === "room").length, ready = C.filter((c) => clientStatus(c) === "done").length;
  return `<div class="kpis"><button type="button" class="kpi" data-filt="all"><span class="eyebrow">${t("kpis.activeClients")}</span><b>${C.length}</b><small>${t("kpis.activeClientsSub", { n: C.filter((c) => c.rc === 0).length })}</small></button>
  <button type="button" class="kpi warn" data-go="queue"><span class="eyebrow">${t("kpis.receiptsToReview")}</span><b>${rev}</b><small>${t("kpis.receiptsToReviewSub", { n: Q.filter((q) => q.state === "open" && q.conf < CS.lowConf).length })}</small></button>
  <button type="button" class="kpi" data-filt="room"><span class="eyebrow">${t("kpis.roomLeft")}</span><b>${room}</b><small>${TaxEngine.FY_LABEL}</small></button>
  <button type="button" class="kpi ok" data-filt="done"><span class="eyebrow">${t("kpis.readyForFiling")}</span><b>${ready}</b><small>${t("kpis.readyForFilingSub")}</small></button></div>`;
}
function caDetailDocs(c) {
  const d = clientDocs(c);
  if (!d.need.length) return `<p class="muted" style="font-size:.84rem">${t("detail.docsNoneNeeded")}</p>`;
  return `<div style="display:grid;gap:.3rem"><span class="eyebrow">${t("detail.docsHeader", { got: d.got.length, need: d.need.length })}</span>${c.imported ? `<span class="muted" style="font-size:.78rem">${t("detail.docTickHelp")}</span>` : ""}${d.need.map((k) => `<div class="a" style="display:flex;justify-content:space-between;gap:.5rem;font-size:.84rem"><span>${c.imported ? `<input type="checkbox" class="chk" data-doc-tick="${c.id}:${k}"${d.got.includes(k) ? " checked" : ""} aria-label="${caEsc(t("detail.docTickAria", { doc: t("docs." + k) }))}"> ` : ""}${t("docs." + k)}</span>${chip(d.got.includes(k) ? "done" : "room", d.got.includes(k) ? t("detail.docGot") : t("detail.docMissing"))}</div>`).join("")}</div>`;
}
function caDetailElection(c) {
  if (c.rc === 0) return "";
  const f = caElectionFlag(c);
  return `<div class="consent">${ic(f ? "alert" : "check")}<span>${f ? t("election.detail", { elected: c.elected, better: f.better, amount: caInr(f.gap) }) : t("election.ok", { elected: c.elected })}</span></div>`;
}
function caDetailLandlord(c) {
  if (!(c.hra > 0 && c.rent > 0)) return "";
  const f = caLandlordFlag(c), th = TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent;
  if (!f && c.rent <= th) return "";
  return `<div class="consent">${ic(f ? "alert" : "check")}<span>${f ? t("landlord.detail", { rent: caInr(c.rent), threshold: caInr(th) }) : t("landlord.ok", { rent: caInr(c.rent) })}</span></div>`;
}
function caDetail() {
  const c = C.find((x) => x.id === caSel);
  if (!c) return `<aside class="detail"><p class="muted">${t("detail.selectPrompt")}</p></aside>`;
  const r = regimeForClient(c), items = Q.filter((q) => q.c === c.id && q.state === "open");
  const ds = (n, u, cap, gloss) => { const st = u >= cap ? "done" : u === 0 ? "none" : "room"; return `<div class="dsec"><div class="t"><b>${caSec(n)}${gloss ? " · " + gloss : ""}</b>${chip(st, st === "done" ? t("detail.fullyUsed") : st === "none" ? t("detail.notLogged") : t("detail.amountLeft", { amount: caInr(cap - u) }))}</div><div class="meter ${st}">${st === "none" ? "" : `<i style="width:${Math.min(100, (u / cap) * 100)}%"></i>`}</div><div class="f num"><span>${caInr(u)}</span><span>${t("detail.of", { cap: caInr(cap) })}</span></div></div>`; };
  return `<aside class="detail" aria-label="Client details">
   <div><span class="eyebrow">${t(c.imported ? "detail.typeAndImported" : "detail.typeAndSample", { type: c.type })}</span><h2>${caEsc(c.name)}</h2></div>
   <dl class="dl"><dt>${t("detail.pan")}</dt><dd class="num">${caPan(c.pan)}</dd><dt>${t("detail.incomeDeclared")}</dt><dd class="num">${caInr(c.inc)}</dd><dt>${t("detail.receipts")}</dt><dd class="num">${t("detail.receiptsValue", { logged: c.rc, review: c.rev })}</dd><dt>${t("returns.detailLabel")}</dt><dd class="num">${clientReturn(c).text}</dd><dt>${t("detail.hraEstimate")}</dt><dd class="num">${c.hra ? caInr(c.hra) : t("detail.notClaimed")}</dd></dl>
   <div class="consent">${ic("shield")}<span>${t("detail.consentNote", { fy: TaxEngine.FY_LABEL })}</span></div>
   <div class="cmp"><div class="${!r.noData && r.better === "Old" ? "lower" : ""}"><span class="eyebrow">${t("detail.oldRegime")}</span><b>${caInr(r.old)}</b></div><div class="${!r.noData && r.better === "New" ? "lower" : ""}"><span class="eyebrow">${t("detail.newRegime")}</span><b>${caInr(r.neu)}</b></div></div>
   <p class="muted" style="font-size:.78rem" data-regime-note>${r.noData ? t("clients.notEnoughDataDetail") + " " : ""}${t("clients.regimeEstimateNote")}</p>
   ${caDetailElection(c)}
   ${caDetailLandlord(c)}
   ${caDetailDocs(c)}
   ${ds("123", c.s123, TaxEngine.SECTION_CAPS.s123.cap)}${ds("124", c.s124, TaxEngine.SECTION_CAPS.s124.cap)}${ds("126", c.s126, TaxEngine.SECTION_CAPS.s126Self.capUnder60, t("detail.gloss126self"))}${ds("126", c.s126p, TaxEngine.SECTION_CAPS.s126Parents.capUnder60, t("detail.gloss126parents"))}${ds("22", c.s22, TaxEngine.SECTION_CAPS.s22.cap)}
   <div style="display:grid;gap:.45rem"><span class="eyebrow">${t("detail.waitingForReview", { n: items.length })}</span>
   ${items.length ? caReasonField() + items.map(caRvCard).join("") : `<p class="muted" style="font-size:.84rem">${t("detail.nothingToReview")}</p>`}</div>
   ${caActivity(c.id, 5)}
   <div style="display:grid;gap:.3rem"><label class="eyebrow" for="cnote">${t("detail.privateNoteLabel")}</label><textarea id="cnote" placeholder="${t("detail.privateNotePlaceholder")}"></textarea></div>
   <div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn" type="button" disabled title="${t("common.demoOnly")}">${ic("down")}${t("detail.exportSummary")} · ${t("common.demoOnly")}</button><button class="btn ghost" type="button" data-evidence="${c.id}">${ic("down")}${t("evidence.button")}</button><button class="btn ghost" type="button" data-readiness="${c.id}">${ic("down")}${t("readiness.button")}</button><button class="btn ghost" type="button" data-yreview="${c.id}">${ic("down")}${t("yreview.button")}</button>${c.imported ? `<button class="btn warn" type="button" data-del-client="${c.id}">${caDelConfirm === c.id ? t("data.deleteClientConfirm", { name: caEsc(c.name) }) : t("data.deleteClient")}</button>` : ""}${clientDocs(c).missing.length ? `<a class="btn ghost" href="${caWaLink(c, clientDocs(c).missing)}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("detail.askClient")}</a>` : `<button class="btn ghost" type="button" data-toast="${t("detail.askClientToast")}">${ic("msg")}${t("detail.askClient")}</button>`}</div>
   <p class="muted" style="font-size:.76rem">${t("detail.footerNote")}</p>
  </aside>`;
}
function caEsc(x) { return String(x).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]); }
function caReasonField() {
  return `<div class="reason-box" style="display:grid;gap:.25rem"><label class="eyebrow" for="qreason">${t("review.reasonLabel")}</label><input id="qreason" type="text" maxlength="200" autocomplete="off" value="${caEsc(caReason)}" placeholder="${caEsc(t("review.reasonPlaceholder"))}"></div>`;
}
function caActivity(clientId, max) {
  const rows = AUDIT.filter((a) => clientId == null || a.c === clientId).slice(-max).reverse();
  const body = rows.length ? rows.map((a) => `<li style="font-size:.82rem"><b>${t("review.act." + a.type)}</b> · ${caEsc(a.what)} · ${caSec(a.sec)}<div class="muted" style="font-size:.76rem">${t("review.activityBy", { who: caEsc(a.user), time: new Date(a.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}${a.reason ? " · " + t("review.activityReason", { reason: caEsc(a.reason) }) : ""}</div></li>`).join("") : `<li class="muted" style="font-size:.84rem">${t("review.activityEmpty")}</li>`;
  return `<div class="activity" style="display:grid;gap:.3rem"><span class="eyebrow">${t("review.activityTitle")}</span><ul style="list-style:none;margin:0;padding:0;display:grid;gap:.4rem">${body}</ul></div>`;
}
// ---------- Evidence pack (9.6): per-client PDF, one block per section ----------
// Lists what was logged (sample data has totals, not receipt images). Not a tax computation.
const CA_PDF_LIBS = {
  jspdf: "vendor/jspdf.umd.min.js?v=" + (window.__TP_V || "v"), // vendored (MIT), works offline
  autotable: "vendor/jspdf.plugin.autotable.min.js?v=" + (window.__TP_V || "v"),
};
function caEvSecName(n) { return `Section ${n} (${OLD_SEC_NO[n]})`; }
// `only` (optional): an evidence key such as "s126self" limits the pack to that one section (used by the notice register).
function caEvRows(c) { return [["123", "s123", c.s123], ["124", "s124", c.s124], ["126", "s126self", c.s126], ["126", "s126parents", c.s126p], ["22", "s22", c.s22], ["133", "s133", c.s133]]; }
function buildEvidencePackData(c, only) {
  const rows = caEvRows(c).filter((r) => !only || r[1] === only);
  const sections = rows.filter((r) => r[2] > 0).map(([n, key, amount]) => ({ label: `${caEvSecName(n)} (${t("evidence.plain." + key)})`, amount, lastUpload: c.last }));
  const sec = only && rows[0] ? `${caEvSecName(rows[0][0])} (${t("evidence.plain." + only)})` : "";
  return { title: t("evidence.title", { name: c.name, fy: TaxEngine.FY_LABEL }), intro: t("evidence.intro") + (sec ? " " + t("notice.packScope", { section: sec }) : ""), sections, empty: only ? t("evidence.sectionOnly") : t("evidence.empty"), footer: t("evidence.footer"), filename: "TaxPlot_Evidence_Pack_" + c.name.replace(/\W+/g, "_") + (only ? "_" + only : "") + ".pdf" };
}
// ---------- Review record (research item 8): dated record of review actions for one client ----------
function buildReadinessRecordData(c, now = Date.now()) {
  const fmt = (ms) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const log = AUDIT.filter((a) => a.c === c.id).map((a) => ({ when: fmt(a.at), who: a.user, action: t("review.act." + a.type), item: `${a.what} (${caEvSecName(a.sec)})`, reason: a.reason || "" }));
  const open = Q.filter((q) => q.c === c.id && q.state === "open").map((q) => `${q.who} — ${caEvSecName(q.sec)} — Rs. ${Math.round(q.amt).toLocaleString("en-IN")}`);
  const flags = [];
  const ef = caElectionFlag(c); if (ef) flags.push(t("readiness.flagRegime", { elected: c.elected, better: ef.better }));
  if (caLandlordFlag(c)) flags.push(t("readiness.flagLandlord", { rent: "Rs. " + Math.round(c.rent).toLocaleString("en-IN") }));
  return { title: t("readiness.title", { name: c.name, fy: TaxEngine.FY_LABEL }), generated: t("readiness.generated", { time: fmt(now), who: CA_USER }), intro: t("readiness.intro"), log, logEmpty: t("readiness.logEmpty"), open, openHeader: t("readiness.openHeader", { n: open.length }), openNone: t("readiness.openNone"), flags, flagsNone: t("readiness.flagsNone"), footer: t("readiness.footer"), filename: "TaxPlot_Review_Record_" + c.name.replace(/\W+/g, "_") + ".pdf" };
}
async function caExportReadinessRecord(id) {
  const c = C.find((x) => x.id === id); if (!c) return;
  const data = buildReadinessRecordData(c);
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) await caLoadScript(CA_PDF_LIBS.jspdf);
    if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await caLoadScript(CA_PDF_LIBS.autotable);
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    let y = 50;
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, 40, y); y += 20;
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.text(data.generated, 40, y); y += 16;
    const intro = doc.splitTextToSize(data.intro, 515); doc.text(intro, 40, y); y += intro.length * 12 + 10;
    doc.setFont(undefined, "bold"); doc.text(t("readiness.logHeader"), 40, y); doc.setFont(undefined, "normal"); y += 6;
    if (!data.log.length) { y += 12; doc.text(data.logEmpty, 40, y); y += 16; }
    else { doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, head: [[t("readiness.colWhen"), t("readiness.colWho"), t("readiness.colAction"), t("readiness.colItem"), t("readiness.colReason")]], body: data.log.map((r) => [r.when, r.who, r.action, r.item, r.reason]), theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } }); y = doc.lastAutoTable.finalY + 16; }
    doc.setFont(undefined, "bold"); doc.text(data.openHeader, 40, y); doc.setFont(undefined, "normal"); y += 14;
    (data.open.length ? data.open : [data.openNone]).forEach((l) => { const w = doc.splitTextToSize(l, 515); doc.text(w, 40, y); y += w.length * 12; });
    y += 8; doc.setFont(undefined, "bold"); doc.text(t("readiness.flagsHeader"), 40, y); doc.setFont(undefined, "normal"); y += 14;
    (data.flags.length ? data.flags : [data.flagsNone]).forEach((l) => { const w = doc.splitTextToSize(l, 515); doc.text(w, 40, y); y += w.length * 12; });
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(data.footer, 40, 810, { maxWidth: 515 }); doc.setTextColor(0); }
    doc.save(data.filename);
  } catch (e) { console.error("Readiness record PDF failed:", e); caToast(t("readiness.failed")); }
}
function caLoadScript(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("load failed " + src)); document.head.appendChild(s); });
}
async function caExportEvidencePack(id, only) {
  const c = C.find((x) => x.id === id); if (!c) return;
  const data = buildEvidencePackData(c, only);
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) await caLoadScript(CA_PDF_LIBS.jspdf);
    if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await caLoadScript(CA_PDF_LIBS.autotable);
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    let y = 50;
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, 40, y); y += 22;
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    const intro = doc.splitTextToSize(data.intro, 515); doc.text(intro, 40, y); y += intro.length * 12 + 14;
    if (!data.sections.length) doc.text(data.empty, 40, y);
    else doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, head: [[t("evidence.colSection"), t("evidence.colAmount"), t("evidence.colLastUpload")]], body: data.sections.map((s) => [s.label, "Rs. " + Math.round(s.amount).toLocaleString("en-IN"), s.lastUpload]), theme: "grid", styles: { fontSize: 9 }, headStyles: { fillColor: [40, 40, 40] } });
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(data.footer, 40, 820, { maxWidth: 515 }); doc.setTextColor(0); }
    doc.save(data.filename);
  } catch (e) { console.error("Evidence pack PDF failed:", e); caToast(t("evidence.failed")); }
}
function caRvCard(q) {
  return `<div class="rv"><div class="a"><b>${q.who}</b><span class="num">${caInr(q.amt)}</span></div><div class="a muted" style="font-size:.78rem"><span>${caSec(q.sec)} · ${new Date(q.d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span class="conf ${q.conf < CS.lowConf ? "low" : ""}">${t("review.readPct", { conf: q.conf })}${q.field ? t("review.checkField", { field: q.field.toLowerCase() }) : ""}</span></div>
 <div class="acts"><button class="btn sm" type="button" data-q="approve" data-id="${q.id}">${ic("check")}${t("review.approve")}</button><button class="btn ghost sm" type="button" data-q="query" data-id="${q.id}">${ic("msg")}${t("review.query")}</button><button class="btn warn sm" type="button" data-q="reject" data-id="${q.id}">${ic("x")}${t("review.reject")}</button></div></div>`;
}

// ---------- Invite my clients + client pulls the CA in (research items 1 and 2) ----------
// DEMO ONLY: no real link, no sending, no data collection, no referral reward or credit of any kind.
// The wa.me link only opens a message the CA reads, edits and sends themselves.
let caInvStep = 1;
// Issue #19: the template ends the name with its own full stop, so drop a trailing one here.
const INVITE_FIRM = "Ritu M.".replace(/\.+$/, "");
function caInviteView() {
  const steps = [1, 2, 3, 4];
  const chips = steps.map((n) => `<button class="fchip" type="button" data-inv-step="${n}" aria-pressed="${caInvStep === n}">${t("invite.stepChip", { n, name: t("invite.step" + n + ".name") })}</button>`).join("");
  const wa = "https://wa.me/?text=" + encodeURIComponent(t("invite.message", { firm: INVITE_FIRM }));
  const cur = t("invite.step" + caInvStep + ".body");
  const draft = `<section class="cardx"><header><h2>${t("invite.draftTitle")}</h2><p>${t("invite.draftSub")}</p></header><div class="note-box" style="margin:.2rem 1rem">${t("invite.message", { firm: INVITE_FIRM })}</div><div style="padding:.5rem 1rem"><a class="btn sm" data-invite-wa href="${wa}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("invite.openWa")}</a></div><p class="muted" style="font-size:.78rem;padding:0 1rem .6rem">${t("invite.draftNote")}</p></section>`;
  const land = `<section class="cardx"><header><h2>${t("invite.landTitle")}</h2><p>${t("invite.landSub")}</p></header><div class="note-box" style="margin:.2rem 1rem"><b>${t("invite.landHead")}</b><p>${t("invite.landBody", { pan: caMaskPan4("ABCDE1234K") })}</p><p class="muted">${t("invite.landPrice")}</p><button class="btn ghost sm" type="button" data-toast="${t("invite.landToast")}">${t("invite.landButton")}</button></div></section>`;
  return `<div class="ph"><h1>${t("invite.title")}</h1><span class="pill">${t("invite.demoPill")}</span></div><p class="muted" style="font-size:.86rem">${t("invite.sub")}</p><div class="note-box">${ic("info")}<span>${t("invite.demoNote")}</span></div><section class="cardx"><header><h2>${t("invite.flowTitle")}</h2></header><div class="fbar">${chips}</div><p style="padding:.2rem 1rem .6rem">${cur}</p></section>${draft}${land}<div class="note-box">${ic("info")}<span>${t("invite.rules")}</span></div>${CA_DISC}`;
}
const CA_VIEWS = {
  clients() { return { main: `<div class="ph"><h1>${t("clients.title")}</h1><span class="pill">${t("common.sampleData")}</span><button class="btn ghost" type="button" data-go="invite">${t("clients.inviteClient")}</button><button class="btn" type="button" disabled title="${t("common.demoOnly")}">${ic("down")}${t("clients.export")} · ${t("common.demoOnly")}</button></div>${caKpis()}${caBulkPanel()}${caRoomPanel()}${caOppPanel()}${caClientTable()}`, detail: true }; },
  dash() {
    const open = Q.filter((q) => q.state === "open");
    return { main: `<div class="ph"><h1>${t(caGreetingKey())}</h1><span class="muted" style="font-size:.85rem">${t("dash.practiceLine", { n: C.length })}</span></div>${caKpis()}
    <div class="two"><section class="cardx"><header><h2>${t("dash.nextDeadlines")}</h2><p>${t("dash.nextDeadlinesSub")}</p></header>${TaxEngine.DEADLINES.filter((d) => caDays(d) >= 0).slice(0, 3).map((d) => { const days = caDays(d); return `<div class="row"><div><span class="lbl">${d.label}</span><p class="help">${d.who}</p></div>${chip(days <= 45 ? "soon" : "room", t("dash.daysLabel", { n: days }))}</div>`; }).join("")}</section>
    <section class="cardx"><header><h2>${t("dash.lowConfidenceReceipts")}</h2><p>${t("dash.lowConfidenceSub")}</p></header>${open.slice().sort((a, b) => a.conf - b.conf).slice(0, 4).map((q) => `<div class="row"><div><span class="lbl">${q.who}</span><p class="help">${caEsc(C.find((c) => c.id === q.c).name)} · ${caSec(q.sec)}</p></div><span class="conf low">${q.conf}%</span></div>`).join("")}</section></div>
    <section class="cardx"><header><h2>${t("dash.regimePicture")}</h2><p>${t("dash.regimePictureSub")}</p></header><div class="row"><div><span class="lbl">${t("dash.newRegimeLower")}</span><p class="help">${C.filter((c) => c.rc && regimeForClient(c).better === "New").map((c) => c.name.split(" ")[0]).join(", ") || t("dash.noneYet")}</p></div><b class="num">${C.filter((c) => c.rc && regimeForClient(c).better === "New").length}</b></div><div class="row"><div><span class="lbl">${t("dash.oldRegimeLower")}</span><p class="help">${C.filter((c) => c.rc && regimeForClient(c).better === "Old").map((c) => c.name.split(" ")[0]).join(", ") || t("dash.noneYet")}</p></div><b class="num">${C.filter((c) => c.rc && regimeForClient(c).better === "Old").length}</b></div></section>`, detail: false };
  },
  queue() {
    const all = Q.filter((q) => q.state === "open"), open = caQVisible(), fine = all.filter(caQFine).length;
    return { main: `<div class="ph"><h1>${t("queue.title")}</h1><span class="muted" style="font-size:.85rem">${CS.shortcuts ? t("queue.shortcutsHint") : ""}</span></div>
    ${all.length ? caReasonField() : ""}
    ${fine ? `<div class="fbar"><button class="fchip" type="button" data-qall="1" aria-pressed="${caQShowAll}">${caQShowAll ? t("queue.exceptionsOnly") : t("queue.showAll", { n: all.length })}</button>${caQShowAll ? "" : `<span class="muted" style="font-size:.8rem">${t("queue.hiddenNote", { n: fine })}</span>`}</div>` : ""}
    <div class="grid"><table><thead><tr><th>${t("queue.colClient")}</th><th>${t("queue.colReceipt")}</th><th>${t("queue.colCounts")}</th><th class="r">${t("queue.colAmount")}</th><th>${t("queue.colConfidence")}</th><th>${t("queue.colCheck")}</th><th>${t("queue.colUploaded")}</th><th>${t("queue.colAction")}</th></tr></thead><tbody>
    ${open.length ? open.map((q) => `<tr data-qrow="${q.id}" aria-selected="${caQSel === q.id}"><td class="cname">${caEsc(C.find((c) => c.id === q.c).name)}</td><td>${q.who}</td><td>${caSec(q.sec)}</td><td class="r num">${caInr(q.amt)}</td><td><span class="conf ${q.conf < CS.lowConf ? "low" : ""}">${q.conf}%</span></td><td>${caRuleFlag(q) ? chip("check", caRuleFlag(q)) : q.field ? chip("check", q.field) : caQFine(q) ? chip("done", t("queue.looksFine")) : "<span class='muted'>–</span>"}</td><td class="num muted">${new Date(q.d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td><td><div style="display:flex;gap:.3rem"><button class="btn sm" type="button" data-q="approve" data-id="${q.id}">${t("review.approve")}</button><button class="btn ghost sm" type="button" data-q="query" data-id="${q.id}">${t("review.query")}</button></div></td></tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:2rem">${chip("done", fine ? t("queue.onlyFine", { n: fine }) : t("queue.queueClear"))}</td></tr>`}
    </tbody></table></div>
    <div class="cards" role="list" aria-label="${t("queue.title")}">${open.length ? open.map((q) => `<article class="ccard" role="listitem" data-qrow="${q.id}" aria-current="${caQSel === q.id}"><div class="h"><b>${caEsc(C.find((c) => c.id === q.c).name)}</b><span class="num">${caInr(q.amt)}</span></div><div class="sub">${q.who}</div><div class="muted sub">${caSec(q.sec)} · ${new Date(q.d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · <span class="conf ${q.conf < CS.lowConf ? "low" : ""}">${t("review.readPct", { conf: q.conf })}</span></div>${caRuleFlag(q) ? `<div>${chip("check", caRuleFlag(q))}</div>` : q.field ? `<div>${chip("check", q.field)}</div>` : caQFine(q) ? `<div>${chip("done", t("queue.looksFine"))}</div>` : ""}<div class="acts"><button class="btn sm" type="button" data-q="approve" data-id="${q.id}">${ic("check")}${t("review.approve")}</button><button class="btn ghost sm" type="button" data-q="query" data-id="${q.id}">${ic("msg")}${t("review.query")}</button><button class="btn warn sm" type="button" data-q="reject" data-id="${q.id}">${ic("x")}${t("review.reject")}</button></div></article>`).join("") : `<div style="text-align:center;padding:1.5rem">${chip("done", fine ? t("queue.onlyFine", { n: fine }) : t("queue.queueClear"))}</div>`}</div>${caActivity(null, 8)}<p class="muted" style="font-size:.8rem">${t("queue.footerNote")}</p>`, detail: false };
  },
  deadlines() { return { main: `<div class="ph"><h1>${t("deadlines.title")}</h1><span class="chip st-check">${ic("eye")}${t("deadlines.verifyChip")}</span></div>
    <div class="grid" style="max-height:none"><table><thead><tr><th>${t("deadlines.colDate")}</th><th>${t("deadlines.colWhat")}</th><th>${t("deadlines.colWho")}</th><th class="r">${t("deadlines.colDaysLeft")}</th><th>${t("deadlines.colStatus")}</th></tr></thead><tbody>${TaxEngine.DEADLINES.map((d) => { const days = caDays(d); return `<tr><td class="num">${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td class="cname">${d.label}</td><td>${d.who}</td><td class="r num">${days < 0 ? "–" : days}</td><td>${caDeadlineChip(days)}</td></tr>`; }).join("")}</tbody></table></div>
    <div class="cards" role="list" aria-label="${t("deadlines.title")}">${TaxEngine.DEADLINES.map((d) => { const days = caDays(d); return `<article class="ccard" role="listitem"><div class="h"><b>${d.label}</b>${caDeadlineChip(days)}</div><span class="sub">${d.who}</span><div class="kv"><span><span class="eyebrow">${t("deadlines.colDate")}</span>${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><span><span class="eyebrow">${t("deadlines.colDaysLeft")}</span>${days < 0 ? "–" : days}</span></div></article>`; }).join("")}</div>`, detail: false }; },
  import() { return { main: caImportView(), detail: false }; },
  notices() { return { main: caNoticeView(), detail: false }; },
  rules() { return { main: caRulesView(), detail: false }; },
  season() { return { main: caSeasonView(), detail: false }; },
  status() { return { main: caStatusView(), detail: false }; },
  plan() { return { main: caPlanView(), detail: false }; },
  invite() { return { main: caInviteView(), detail: false }; },
  reports() { return { main: `<div class="ph"><h1>${t("reports.title")}</h1></div><section class="cardx"><header><h2>${t("reports.exportsHeader")}</h2><p>${t("reports.exportsSub")}</p></header>
    ${(CA_LOCALE.ca.reports.items || []).map(({ title, help }) => `<div class="row"><div><span class="lbl">${title}</span><p class="help">${help}</p></div><button class="btn ghost" type="button" disabled title="${t("common.demoOnly")}">${ic("down")}${t("reports.exportBtn")} · ${t("common.demoOnly")}</button></div>`).join("")}</section>
    <div class="note-box">${ic("info")}<span>${t("reports.noteBox")}</span></div>`, detail: false }; },
  settings() {
    const seg = (k, o) => `<div class="seg">${o.map(([v, label, i]) => `<button type="button" data-set="${k}" data-val="${v}" aria-pressed="${CS[k] === v}">${i ? ic(i) : ""}${label}</button>`).join("")}</div>`;
    const sw = (k, l) => `<button type="button" class="switch" role="switch" data-toggle="${k}" aria-checked="${!!CS[k]}" aria-label="${l}"></button>`;
    const row = (l, h, c) => `<div class="row"><div><span class="lbl">${l}</span>${h ? `<p class="help">${h}</p>` : ""}</div><div>${c}</div></div>`;
    return { main: `<div class="ph"><h1>${t("settings.title")}</h1><button class="btn ghost" type="button" data-act="reset">${t("common.resetToDefaults")}</button></div>
    <div class="two"><section class="cardx"><header><h2>${t("settings.appearanceHeader")}</h2><p>${t("settings.appearanceSub")}</p></header>
     ${row(t("settings.themeLabel"), t("settings.themeHelp"), seg("theme", [["auto", t("settings.themeAuto"), "auto"], ["light", t("settings.themeLight"), "sun"], ["dark", t("settings.themeDark"), "moon"]]))}
     ${row(t("settings.densityLabel"), t("settings.densityHelp"), seg("density", [["compact", t("settings.densityCompact")], ["comfortable", t("settings.densityComfortable")]]))}
     ${row(t("settings.textSizeLabel"), "", seg("text", [["default", t("settings.textDefault")], ["large", t("settings.textLarge")]]))}
     ${row(t("settings.keyboardShortcutsLabel"), t("settings.keyboardShortcutsHelp"), sw("shortcuts", t("settings.keyboardShortcutsLabel")))}</section>
    <section class="cardx"><header><h2>${t("settings.dataDisplayHeader")}</h2></header>
     ${row(t("settings.numberFormatLabel"), "", seg("numFormat", [["lakh", t("settings.lakhCrore")], ["intl", t("settings.international")]]))}
     ${row(t("settings.sectionNumbersLabel"), t("settings.sectionNumbersHelp"), seg("sectionOrder", [["new", t("settings.sectionNumbersNew")], ["old", t("settings.sectionNumbersOld")]]))}
     ${row(t("settings.maskPanLabel"), t("settings.maskPanHelp"), sw("maskPan", t("settings.maskPanLabel")))}
     ${row(t("settings.plainWordsLabel"), t("settings.plainWordsHelp"), sw("plainWords", t("settings.plainWordsLabel")))}
     ${row(t("settings.lowConfidenceLabel"), t("settings.lowConfidenceHelp"), `<select class="sel" id="ca-lowConf" aria-label="${t("settings.lowConfidenceLabel")}">${[70, 80, 90].map((v) => `<option value="${v}"${CS.lowConf === v ? " selected" : ""}>${t("settings.belowPct", { v })}</option>`).join("")}</select>`)}</section>
    <section class="cardx"><header><h2>${t("settings.firmHeader")}</h2></header>
     ${row(t("settings.firmNameLabel"), t("settings.firmNameHelp"), `<span class="muted">${t("settings.firmNameValue")}</span>`)}
     ${row(t("settings.teamMembersLabel"), t("settings.teamMembersHelp"), `<span class="muted">${t("settings.teamMembersValue")}</span>`)}</section>
    <section class="cardx"><header><h2>${t("settings.consentHeader")}</h2></header>
     ${row(t("settings.accessWorksLabel"), t("settings.accessWorksHelp"), chip("done", t("settings.on")))}
     ${row(t("settings.accessLogLabel"), t("settings.accessLogHelp"), chip("done", t("settings.on")))}</section></div>
    ${caDataSection()}
    <div class="note-box">${ic("shield")}<span>${t("settings.noteBox")}</span></div>
    ${CA_DISC}`, detail: false };
  },
};

// ---------- Client import (Turia research item 2) ----------
// The CA picks a CSV; it is parsed in this browser and never uploaded. PANs are masked the moment
// they are read (last 4 characters kept, the full PAN is not stored or shown or exported).
// Intake flags only decide which documents we expect; they carry no amounts and no tax figures.
const CA_IMPORT_CONFIG = {
  maxBytes: 1024 * 1024, maxRows: 500, idStart: 1000, storeKey: "taxplot.ca.imported",
  types: { salaried: "Salaried", freelancer: "Freelancer", "gig worker": "Gig worker", gig: "Gig worker" },
  // [key, accepted header names (first one is the template name), required]
  columns: [["name", ["name", "client_name", "client"], true], ["pan", ["pan", "pan_number"], true], ["type", ["type", "client_type"], true], ["income", ["annual_income", "income"]], ["regime", ["regime_on_record", "regime"]], ["rent", ["rent_paid", "annual_rent", "rent"]], ["landlordPan", ["landlord_pan_on_file", "landlord_pan"]], ["homeLoan", ["home_loan"]], ["health", ["health_insurance_self", "health_insurance", "health"]], ["parentsHealth", ["health_insurance_parents", "parents_health"]], ["nps", ["nps"]], ["donations", ["donations"]]],
  flagKeys: ["rent", "homeLoan", "health", "parentsHealth", "nps", "donations"],
  example: ["Example Client", "ABCDE1234F", "Salaried", "1200000", "New", "0", "", "no", "yes", "no", "no", "no"], // fictional placeholder PAN
};
var caImp = null, caImpErr = "", caImpConfirm = false; // var: reachable from tests
function caParseCsv(text) {
  const out = []; let row = [], cell = "", q = false, line = 1, start = 1;
  const endRow = () => { row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) out.push({ line: start, cells: row }); row = []; start = line + 1; };
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else { if (ch === "\n") line++; cell += ch; } }
    else if (ch === '"' && cell === "") q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; endRow(); line++; start = line; }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return out;
}
function caImportTemplateText() {
  const cols = CA_IMPORT_CONFIG.columns;
  return cols.map((c) => c[1][0]).join(",") + "\n" + CA_IMPORT_CONFIG.example.map(caCsvCell).join(",") + "\n";
}
function caCutName(s) { return Array.from(s).slice(0, 60).join(""); }
function caCleanName(n) { return caCutName(String(n == null ? "" : n).replace(/[<>"`\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim()); }
function caImportParse(text) {
  const cfg = CA_IMPORT_CONFIG, recs = caParseCsv(text);
  if (!recs.length) return { fileError: t("import.errEmpty"), rows: [] };
  const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const heads = recs[0].cells.map(norm), idx = {};
  cfg.columns.forEach(([k, names]) => { const i = heads.findIndex((h) => names.includes(h)); if (i >= 0) idx[k] = i; });
  const missing = cfg.columns.filter(([k, , req]) => req && idx[k] === undefined).map(([, names]) => names[0]);
  if (missing.length) return { fileError: t("import.errHeader", { cols: missing.join(", ") }), rows: [] };
  const used = new Set(Object.values(idx)), ignored = recs[0].cells.filter((h, i) => !used.has(i) && h.trim()).map((h) => caCleanName(h));
  const body = recs.slice(1);
  if (body.length > cfg.maxRows) return { fileError: t("import.errTooMany", { n: cfg.maxRows }), rows: [] };
  const seen = new Set(), rows = [];
  body.forEach(({ line, cells }) => {
    const g = (k) => (idx[k] === undefined ? "" : String(cells[idx[k]] == null ? "" : cells[idx[k]]).trim());
    const errors = [], warns = [], rawName = g("name"), name = caCleanName(rawName);
    if (!name) errors.push(t("import.errName")); else if (name !== caCutName(rawName.replace(/\s+/g, " ").trim())) warns.push(t("import.warnName"));
    const pan = g("pan").toUpperCase().replace(/\s+/g, ""), panOk = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
    if (!panOk) errors.push(t("import.errPan")); else if (seen.has(pan)) errors.push(t("import.errPanDup")); else seen.add(pan);
    const last4 = panOk ? pan.slice(-4) : "";
    const type = cfg.types[g("type").toLowerCase()] || ""; if (!type) errors.push(t("import.errType"));
    let inc = 0; const incRaw = g("income").replace(/^(₹|rs\.?|inr)/i, "").replace(/[,\s]/g, "");
    if (incRaw) { if (/^\d+(\.\d+)?$/.test(incRaw)) inc = Math.round(+incRaw); else errors.push(t("import.errIncome")); }
    const rg = g("regime").toLowerCase(); let regime = "";
    if (rg) { if (rg === "old" || rg === "new") regime = rg === "old" ? "Old" : "New"; else errors.push(t("import.errRegime")); }
    let rent = 0; const rentRaw = g("rent").replace(/^(₹|rs\.?|inr)/i, "").replace(/[,\s]/g, "");
    if (rentRaw) { if (/^\d+(\.\d+)?$/.test(rentRaw)) rent = Math.round(+rentRaw); else errors.push(t("import.errRent")); }
    const flag = (k) => { const v = g(k).toLowerCase(); if (!v || ["no", "n", "false", "0"].includes(v)) return false; if (["yes", "y", "true", "1"].includes(v)) return true; errors.push(t("import.errFlag", { col: cfg.columns.find((c) => c[0] === k)[1][0] })); return false; };
    const flags = { rent: rent > 0, homeLoan: flag("homeLoan"), health: flag("health"), parentsHealth: flag("parentsHealth"), nps: flag("nps"), donations: flag("donations") };
    const landlordPan = flag("landlordPan");
    // Already in the workspace (same name and PAN ending): skipped by default so re-importing a file adds nobody twice.
    const dup = !!(last4 && C.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.pan.slice(-4) === last4));
    if (dup) warns.push(t("import.warnDup"));
    rows.push({ line, name, last4, type, inc, regime, rent, landlordPan, flags, errors, warns, dup });
  });
  const dups = rows.filter((r) => !r.errors.length && r.dup).length;
  return { rows, ignored, total: rows.length, ok: rows.filter((r) => !r.errors.length && !r.dup).length, dups };
}
function caMakeClient(f, id) {
  return { id, name: caCleanName(f.name), pan: "XXXXXX" + String(f.last4).slice(-4), type: f.type, inc: f.inc || 0, s123: 0, s124: 0, s126: 0, s126p: 0, s22: 0, hra: 0, rc: 0, rev: 0, last: "—", elected: f.regime || "New", s133: 0, rent: f.rent || 0, landlordPan: !!f.landlordPan, flags: Object.assign({}, f.flags), imported: true };
}
function caImportSave() { try { localStorage.setItem(CA_IMPORT_CONFIG.storeKey, JSON.stringify(C.filter((c) => c.imported))); } catch (e) {} }
function caImportLoad() {
  let arr = []; try { arr = JSON.parse(localStorage.getItem(CA_IMPORT_CONFIG.storeKey) || "[]"); } catch (e) {}
  if (!Array.isArray(arr)) return;
  arr.forEach((o) => {
    if (!o || typeof o.name !== "string" || !Number.isInteger(o.id) || C.some((c) => c.id === o.id)) return;
    const type = Object.values(CA_IMPORT_CONFIG.types).includes(o.type) ? o.type : "Salaried", fl = o.flags || {};
    const flags = {}; CA_IMPORT_CONFIG.flagKeys.forEach((k) => { flags[k] = !!fl[k]; });
    const c = caMakeClient({ name: o.name, last4: String(o.pan || "").replace(/[^A-Z0-9]/gi, "").slice(-4), type, inc: Math.max(0, +o.inc || 0), regime: o.elected === "Old" ? "Old" : "New", rent: Math.max(0, +o.rent || 0), landlordPan: o.landlordPan, flags }, o.id);
    if (c.name) C.push(c);
  });
}
function caImportLoadText(text) { caImp = caImportParse(text); caImpErr = caImp.fileError || ""; caImpConfirm = false; caRender(); }
function caImportFile(file) {
  const max = CA_IMPORT_CONFIG.maxBytes;
  if (!file) return;
  if (file.size > max) { caImp = null; caImpErr = t("import.errTooBig", { mb: Math.round(max / 1048576) }); return caRender(); }
  if (!/\.csv$/i.test(file.name || "")) { caImp = null; caImpErr = t("import.errNotCsv"); return caRender(); }
  const done = (txt) => caImportLoadText(txt), fail = () => { caImp = null; caImpErr = t("import.errRead"); caRender(); };
  const badEnc = () => { caImp = null; caImpErr = t("import.errEncoding"); caRender(); };
  // Decode strictly: a file that is not UTF-8 (for example Excel's plain "CSV") would silently turn names into replacement characters.
  const decode = (buf) => { let txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { return badEnc(); } done(txt); };
  if (file.arrayBuffer && typeof TextDecoder !== "undefined") file.arrayBuffer().then(decode, fail);
  else if (file.text) file.text().then(done, fail);
  else { const r = new FileReader(); r.onload = () => done(String(r.result)); r.onerror = fail; r.readAsText(file); }
}
function caImportCommit() {
  const ok = caImp && caImp.rows ? caImp.rows.filter((r) => !r.errors.length && !r.dup) : [];
  const skipped = caImp && caImp.rows ? caImp.rows.filter((r) => !r.errors.length && r.dup).length : 0;
  if (!ok.length) { caToast(skipped ? t("import.nothingNew", { skipped }) : t("import.nothing")); return; }
  let id = Math.max(CA_IMPORT_CONFIG.idStart, ...C.map((c) => c.id)) + 1;
  ok.forEach((r) => C.push(caMakeClient(r, id++)));
  caImportSave(); caImp = null; caImpErr = "";
  caToast(skipped ? t("import.doneSkipped", { n: ok.length, skipped }) : t("import.done", { n: ok.length })); caView = "clients"; caRender();
}
function caImportDownloadTemplate() {
  try {
    const url = URL.createObjectURL(new Blob([caImportTemplateText()], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = t("import.templateFile"); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { console.error("Template download failed", e); }
}
function caImportView() {
  const cfg = CA_IMPORT_CONFIG, n = C.filter((c) => c.imported).length;
  const cols = cfg.columns.map(([k, names, req]) => `<div class="row"><div><span class="lbl"><code>${names[0]}</code>${req ? ` <span class="pill">${t("import.required")}</span>` : ""}</span><p class="help">${t("import.col." + k)}</p></div></div>`).join("");
  const flagText = (f) => cfg.flagKeys.filter((k) => f[k]).map((k) => t("import.flag." + k)).join(", ") || t("import.noFlags");
  let prev = "";
  if (caImp && caImp.rows && caImp.rows.length) {
    const bad = caImp.total - caImp.ok - (caImp.dups || 0), chk = (r) => (r.errors.length ? chip("check", caEsc(r.errors.join("; "))) : chip("done", t("import.rowOk"))) + (r.warns.length ? `<div class="muted" style="font-size:.76rem">${caEsc(r.warns.join("; "))}</div>` : "");
    prev = `<section class="cardx" data-imp-preview><header><h2>${t("import.step3")}</h2><p>${t("import.summary", { total: caImp.total, ok: caImp.ok, bad })}${caImp.dups ? " " + t("import.summaryDups", { n: caImp.dups }) : ""}</p></header>
    ${caImp.ignored.length ? `<p class="muted" style="font-size:.8rem">${t("import.ignored", { cols: caEsc(caImp.ignored.join(", ")) })}</p>` : ""}
    <div class="grid" role="region" aria-label="${t("import.step3")}" style="max-height:none"><table><thead><tr><th>${t("import.colLine")}</th><th>${t("import.colName")}</th><th>${t("import.colPan")}</th><th>${t("import.colType")}</th><th class="r">${t("import.colIncome")}</th><th>${t("import.colFlags")}</th><th>${t("import.colCheck")}</th></tr></thead><tbody>
    ${caImp.rows.map((r) => `<tr data-improw="${r.line}"><td class="num">${r.line}</td><td class="cname">${caEsc(r.name)}</td><td class="pan">${r.last4 ? "XXXXXX" + caEsc(r.last4) : "–"}</td><td>${caEsc(r.type) || "–"}</td><td class="r num">${caInr(r.inc)}</td><td>${caEsc(flagText(r.flags))}</td><td>${chk(r)}</td></tr>`).join("")}</tbody></table></div>
    <div class="cards" role="list" aria-label="${t("import.step3")}">${caImp.rows.map((r) => `<article class="ccard" role="listitem" data-improw="${r.line}"><div class="h"><b>${caEsc(r.name) || "–"}</b><span class="muted">#${r.line}</span></div><span class="muted sub">${caEsc(r.type) || "–"} · <span class="pan">${r.last4 ? "XXXXXX" + caEsc(r.last4) : "–"}</span> · <span class="num">${caInr(r.inc)}</span></span><span class="sub">${caEsc(flagText(r.flags))}</span><span>${chk(r)}</span></article>`).join("")}</div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.6rem"><button class="btn" type="button" data-imp="import"${caImp.ok ? "" : " disabled"}>${ic("check")}${t("import.importBtn", { n: caImp.ok })}</button><button class="btn ghost" type="button" data-imp="clear">${t("import.clearBtn")}</button></div></section>`;
  }
  return `<div class="ph"><h1>${t("import.title")}</h1></div>
  <div class="note-box">${ic("shield")}<span><b>${t("import.privacy")}</b> ${t("import.panNote")} ${t("import.stored")}</span></div>
  <section class="cardx"><header><h2>${t("import.step1")}</h2><p>${t("import.step1Help")}</p></header><button class="btn ghost" type="button" data-imp="template">${ic("down")}${t("import.templateBtn")}</button><details style="margin-top:.6rem"><summary>${t("import.columnsLabel")}</summary>${cols}</details></section>
  <section class="cardx"><header><h2>${t("import.step2")}</h2><p>${t("import.step2Help", { rows: cfg.maxRows })}</p></header><input type="file" id="ca-import-file" accept=".csv,text/csv" aria-label="${t("import.fileLabel")}">${caImpErr ? `<p role="alert" class="muted" style="color:var(--warn,#b45309);margin-top:.5rem">${caEsc(caImpErr)}</p>` : ""}</section>
  ${prev}
  <section class="cardx"><div class="row"><div><span class="lbl">${n ? t("import.importedCount", { n }) : t("import.importedNone")}</span></div>${n ? `<button class="btn warn sm" type="button" data-imp="remove">${caImpConfirm ? t("import.removeConfirm", { n }) : t("import.removeBtn")}</button>` : ""}</div></section>
  ${CA_DISC}`;
}

// ---------- Data on this device: delete, clear, backup, restore (audit #7) ----------
// Everything the CA workspace keeps is in this browser's localStorage under "taxplot.ca.". Appearance settings
// are not client data and are left alone. Sample clients are fictional and always come back.
const CA_DATA_KEYS = ["taxplot.ca.imported", "taxplot.ca.notices", "taxplot.ca.clientStatus", "taxplot.ca.annualPlan", CA_REVIEW_KEY, CA_DOCS_KEY];
var caDelConfirm = 0, caClearConfirm = false;
function caResetMemory() {
  C = C.filter((c) => !c.imported); Q.forEach((q) => { q.state = "open"; }); AUDIT.length = 0;
  caNotices = []; caStat = {}; caPlan = {}; caDocsGot = {}; syncReviewCounts();
}
function caReloadFromStorage() { caResetMemory(); caImportLoad(); caNtcLoad(); caStatLoad(); caPlanLoad(); caDocsLoad(); caReviewLoad(); syncReviewCounts(); if (!C.some((c) => c.id === caSel)) caSel = (C[0] || {}).id; }
function caDeleteClient(id) {
  const c = C.find((x) => x.id === id);
  if (!c || !c.imported) return;
  C = C.filter((x) => x.id !== id);
  caNotices = caNotices.filter((x) => x.c !== id); delete caStat[id]; delete caPlan[id]; delete caDocsGot[id];
  AUDIT = AUDIT.filter((a) => a.c !== id);
  caImportSave(); caNtcSave(); caStatSave(); caPlanSave(); caDocsSave(); caReviewSave();
  caDelConfirm = 0; caSel = (C[0] || {}).id; caToast(t("data.clientDeleted")); caRender();
}
function caClearAllData() {
  CA_DATA_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  caResetMemory(); caClearConfirm = false; caDelConfirm = 0; caSel = (C[0] || {}).id; caToast(t("data.cleared")); caRender();
}
function caBackupText() {
  const data = {}; CA_DATA_KEYS.forEach((k) => { try { const v = localStorage.getItem(k); if (v) data[k] = v; } catch (e) {} });
  return JSON.stringify({ taxplotCaBackup: 1, saved: caLocalISO(), data });
}
function caBackupDownload() {
  try {
    const url = URL.createObjectURL(new Blob([caBackupText()], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "TaxPlot_CA_backup_" + caLocalISO() + ".json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    caToast(t("data.backupDone"));
  } catch (e) { console.error("Backup failed", e); }
}
function caRestoreText(text) {
  let o = null; try { o = JSON.parse(text); } catch (e) {}
  if (!o || o.taxplotCaBackup !== 1 || !o.data || typeof o.data !== "object") { caToast(t("data.restoreBad")); return false; }
  const ok = {};
  for (const k of CA_DATA_KEYS) { const v = o.data[k]; if (v === undefined) continue; if (typeof v !== "string" || v.length > 5e6) { caToast(t("data.restoreBad")); return false; } try { JSON.parse(v); } catch (e) { caToast(t("data.restoreBad")); return false; } ok[k] = v; }
  CA_DATA_KEYS.forEach((k) => { try { if (k in ok) localStorage.setItem(k, ok[k]); else localStorage.removeItem(k); } catch (e) {} });
  caReloadFromStorage(); caToast(t("data.restored")); caRender(); return true;
}
function caRestoreFile(file) {
  if (!file) return;
  if (file.size > 8e6) { caToast(t("data.restoreBad")); return; }
  const done = (txt) => caRestoreText(String(txt)), fail = () => caToast(t("data.restoreBad"));
  if (file.text) file.text().then(done, fail); else { const r = new FileReader(); r.onload = () => done(r.result); r.onerror = fail; r.readAsText(file); }
}
function caDataSection() {
  return `<section class="cardx" data-data-section><header><h2>${t("data.header")}</h2><p>${t("data.sub")}</p></header>
   <div class="row"><div><span class="lbl">${t("data.backupLabel")}</span><p class="help">${t("data.backupHelp")}</p></div><button class="btn ghost" type="button" data-dat="backup">${ic("down")}${t("data.backupBtn")}</button></div>
   <div class="row"><div><span class="lbl">${t("data.restoreLabel")}</span><p class="help">${t("data.restoreHelp")}</p></div><input type="file" id="ca-restore-file" accept=".json,application/json" aria-label="${t("data.restoreLabel")}"></div>
   <div class="row"><div><span class="lbl">${t("data.clearLabel")}</span><p class="help">${t("data.clearHelp")}</p></div><button class="btn warn" type="button" data-dat="clear">${caClearConfirm ? t("data.clearConfirm") : t("data.clearBtn")}</button></div></section>`;
}

// ---------- Manual notice register (Turia research item 3) ----------
// The CA logs notices by hand. No portal fetching, no credentials, nothing is filed or sent.
// Dates and statuses are the CA's own record, not advice. One click builds that client's evidence pack for the section.
const CA_NOTICE_CONFIG = {
  storeKey: "taxplot.ca.notices", soonDays: 7,
  types: ["intimation", "defective", "information", "scrutiny", "demand", "other"],
  statuses: ["open", "replied", "closed"],
  sections: [["123", "s123"], ["124", "s124"], ["126", "s126self"], ["126", "s126parents"], ["22", "s22"], ["133", "s133"]],
};
var caNotices = [], caNtcErr = "", caNtcDraft = { c: "", type: "intimation", sec: "s123", due: "", status: "open", note: "" };
function caNtcSecLabel(key) { const s = CA_NOTICE_CONFIG.sections.find((x) => x[1] === key); return s ? `${caEvSecName(s[0])} — ${t("evidence.plain." + key)}` : t("notice.otherSection"); }
function caNtcDays(due) { return Math.round((new Date(due) - TODAY) / 864e5); }
function caNtcSave() { try { localStorage.setItem(CA_NOTICE_CONFIG.storeKey, JSON.stringify(caNotices)); } catch (e) {} }
function caNtcValid(o) { return o && Number.isInteger(o.id) && Number.isInteger(o.c) && CA_NOTICE_CONFIG.types.includes(o.type) && CA_NOTICE_CONFIG.statuses.includes(o.status) && /^\d{4}-\d{2}-\d{2}$/.test(o.due) && !isNaN(new Date(o.due)) && (o.sec === "" || CA_NOTICE_CONFIG.sections.some((s) => s[1] === o.sec)); }
function caNtcLoad() { try { const a = JSON.parse(localStorage.getItem(CA_NOTICE_CONFIG.storeKey) || "[]"); if (Array.isArray(a)) caNotices = a.filter(caNtcValid).map((o) => ({ id: o.id, c: o.c, type: o.type, sec: o.sec, due: o.due, status: o.status, note: String(o.note || "").slice(0, 200) })); } catch (e) {} }
function caNtcAdd() {
  const d = caNtcDraft, c = C.find((x) => x.id === +d.c);
  if (!c) { caNtcErr = t("notice.errClient"); return caRender(); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due) || isNaN(new Date(d.due))) { caNtcErr = t("notice.errDue"); return caRender(); }
  caNotices.push({ id: Math.max(0, ...caNotices.map((n) => n.id)) + 1, c: c.id, type: d.type, sec: d.sec, due: d.due, status: d.status, note: d.note.slice(0, 200) });
  caNtcSave(); caNtcErr = ""; caNtcDraft = Object.assign({}, caNtcDraft, { due: "", note: "" });
  caToast(t("notice.added")); caRender();
}
function caNtcEvidence(id) { const n = caNotices.find((x) => x.id === id); if (n) caExportEvidencePack(n.c, n.sec || undefined); }
function caNoticeView() {
  const cfg = CA_NOTICE_CONFIG, d = caNtcDraft;
  const open = caNotices.filter((n) => n.status !== "closed"), late = open.filter((n) => caNtcDays(n.due) < 0).length, soon = open.filter((n) => { const k = caNtcDays(n.due); return k >= 0 && k <= cfg.soonDays; }).length;
  const opt = (v, label, cur) => `<option value="${caEsc(v)}"${String(cur) === String(v) ? " selected" : ""}>${caEsc(label)}</option>`;
  const fld = (label, id, ctl) => `<div style="display:grid;gap:.25rem"><label class="eyebrow" for="${id}">${label}</label>${ctl}</div>`;
  const form = `<section class="cardx"><header><h2>${t("notice.addHeader")}</h2></header><div style="display:grid;gap:.6rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
   ${fld(t("notice.client"), "nf-c", `<select class="sel" id="nf-c" data-nf="c"><option value="">${t("notice.pickClient")}</option>${C.map((c) => opt(c.id, c.name, d.c)).join("")}</select>`)}
   ${fld(t("notice.type"), "nf-type", `<select class="sel" id="nf-type" data-nf="type">${cfg.types.map((k) => opt(k, t("notice.types." + k), d.type)).join("")}</select>`)}
   ${fld(t("notice.section"), "nf-sec", `<select class="sel" id="nf-sec" data-nf="sec">${cfg.sections.map(([, k]) => opt(k, caNtcSecLabel(k), d.sec)).join("")}${opt("", t("notice.otherSection"), d.sec)}</select>`)}
   ${fld(t("notice.due"), "nf-due", `<input class="sel" type="date" id="nf-due" data-nf="due" value="${caEsc(d.due)}">`)}
   ${fld(t("notice.status"), "nf-status", `<select class="sel" id="nf-status" data-nf="status">${cfg.statuses.map((k) => opt(k, t("notice.statuses." + k), d.status)).join("")}</select>`)}
   ${fld(t("notice.noteLabel"), "nf-note", `<input class="sel" type="text" id="nf-note" data-nf="note" maxlength="200" value="${caEsc(d.note)}">`)}</div>
   ${caNtcErr ? `<p role="alert" class="muted" style="color:var(--warn,#b45309)">${caEsc(caNtcErr)}</p>` : ""}
   <div style="margin-top:.6rem"><button class="btn" type="button" data-ntc-add="1">${ic("check")}${t("notice.addBtn")}</button></div></section>`;
  const rows = caNotices.slice().sort((a, b) => (a.due > b.due ? 1 : a.due < b.due ? -1 : a.id - b.id)).map((n) => {
    const c = C.find((x) => x.id === n.c), days = caNtcDays(n.due), name = c ? c.name : t("notice.clientGone");
    const timing = n.status === "closed" ? chip("done", t("notice.closedTiming")) : days < 0 ? chip("soon", t("notice.overdue", { n: -days })) : days === 0 ? chip("check", t("notice.dueToday")) : chip(days <= cfg.soonDays ? "check" : "room", t("notice.inDays", { n: days }));
    const sel = `<select class="sel" data-ntc-status="${n.id}" aria-label="${t("notice.statusAria", { name: caEsc(name) })}">${cfg.statuses.map((k) => opt(k, t("notice.statuses." + k), n.status)).join("")}</select>`;
    const acts = `${c ? `<button class="btn ghost sm" type="button" data-evnotice="${n.id}">${ic("down")}${n.sec ? t("notice.evidenceBtn") : t("notice.evidenceBtnAll")}</button>` : ""}<button class="btn ghost sm" type="button" data-ntc-del="${n.id}">${t("notice.deleteBtn")}</button>`;
    return { n, name, timing, sel, acts };
  });
  const table = rows.length ? `<div class="grid" role="region" aria-label="${t("notice.title")}" style="max-height:none"><table><thead><tr><th>${t("notice.colDue")}</th><th>${t("notice.colClient")}</th><th>${t("notice.colType")}</th><th>${t("notice.colSection")}</th><th>${t("notice.colStatus")}</th><th>${t("notice.colTiming")}</th><th>${t("notice.colAction")}</th></tr></thead><tbody>
   ${rows.map(({ n, name, timing, sel, acts }) => `<tr data-notice="${n.id}"><td class="num">${new Date(n.due).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td class="cname">${caEsc(name)}${n.note ? `<small>${caEsc(n.note)}</small>` : ""}</td><td>${t("notice.types." + n.type)}</td><td>${caEsc(n.sec ? caNtcSecLabel(n.sec) : t("notice.otherSection"))}</td><td>${sel}</td><td>${timing}</td><td><div style="display:flex;gap:.3rem;flex-wrap:wrap">${acts}</div></td></tr>`).join("")}</tbody></table></div>
   <div class="cards" role="list" aria-label="${t("notice.title")}">${rows.map(({ n, name, timing, sel, acts }) => `<article class="ccard" role="listitem" data-notice="${n.id}"><div class="h"><b>${caEsc(name)}</b>${timing}</div><span class="sub">${t("notice.types." + n.type)} · ${caEsc(n.sec ? caNtcSecLabel(n.sec) : t("notice.otherSection"))}</span><span class="muted sub">${new Date(n.due).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}${n.note ? " · " + caEsc(n.note) : ""}</span><span>${sel}</span><div style="display:flex;gap:.3rem;flex-wrap:wrap">${acts}</div></article>`).join("")}</div>` : `<p class="muted">${t("notice.none")}</p>`;
  return `<div class="ph"><h1>${t("notice.title")}</h1></div><p class="muted" style="font-size:.86rem">${t("notice.sub")}</p>
  ${caNotices.length ? `<p class="muted" style="font-size:.84rem">${t("notice.countSummary", { open: open.length, soon, days: cfg.soonDays, late })}</p>` : ""}
  ${form}<section class="cardx">${table}</section><div class="note-box">${ic("info")}<span>${t("notice.note")}</span></div>${CA_DISC}`;
}

// ---------- Client status page + Year in review (CA workspace) ----------
// Status stages and the message are the CA's own words, set by hand; TaxPlot never claims it filed
// anything or that a return was accepted. "filed" is only a label the CA sets. Demo/sample data until
// the backend exists; kept in this browser's localStorage. Year in review uses counts from the review
// record (AUDIT) and TaxEngine figures only; nothing is "tax saved".
const CA_STATUS_CONFIG = { storeKey: "taxplot.ca.clientStatus", stages: ["asked", "received", "reviewed", "ready", "filed"], noteMax: 200 };
var caStat = {}, caStatView = 0; // caStat: { [clientId]: { stage, note } } set by the CA; var for tests
function caStatLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(CA_STATUS_CONFIG.storeKey) || "{}");
    if (o && typeof o === "object") Object.keys(o).forEach((k) => { const v = o[k]; if (v && (v.stage === undefined || CA_STATUS_CONFIG.stages.includes(v.stage))) caStat[k] = { stage: v.stage, note: String(v.note || "").slice(0, CA_STATUS_CONFIG.noteMax) }; });
  } catch (e) {}
}
function caStatSave() { try { localStorage.setItem(CA_STATUS_CONFIG.storeKey, JSON.stringify(caStat)); } catch (e) {} }
// Suggested stage only; never "ready" or "filed" (those are the CA's call).
function caStatSuggest(c) { const d = clientDocs(c); return c.rc === 0 || d.missing.length ? "asked" : c.rev > 0 ? "received" : "reviewed"; }
function caStatOf(c) { const s = caStat[c.id] || {}; return { stage: s.stage || caStatSuggest(c), note: s.note || "", edited: !!s.stage }; }
function caStatSet(id, patch) { caStat[id] = Object.assign({}, caStat[id] || {}, patch); caStatSave(); }
function caStatClientView(c) {
  const st = caStatOf(c), cfg = CA_STATUS_CONFIG, idx = cfg.stages.indexOf(st.stage), d = clientDocs(c);
  const steps = cfg.stages.map((k, i) => `<li${i === idx ? ' aria-current="step"' : ""} style="display:flex;gap:.5rem;align-items:flex-start;padding:.35rem 0;${i === idx ? "font-weight:600" : i > idx ? "opacity:.6" : ""}"><span>${i < idx ? ic("check") : i === idx ? ic("clock") : ic("dash")}</span><span>${t("cstatus.stage." + k)}${i === idx ? ` <span class="pill">${t("cstatus.youAreHere")}</span>` : i > idx ? ` <span class="pill">${t("cstatus.notYet")}</span>` : ""}${i <= idx ? `<span class="muted" style="display:block;font-weight:400;font-size:.8rem">${t("cstatus.stageHelp." + k)}</span>` : ""}</span></li>`).join("");
  const need = d.missing.length ? `<ul>${d.missing.map((k) => `<li>${t("docs." + k)}</li>`).join("")}</ul>` : `<p class="muted">${t("cstatus.nothingNeeded")}</p>`;
  return `<section class="cardx cs-print" data-client-status-view="${c.id}"><header><h2>${t("cstatus.clientViewTitle", { fy: TaxEngine.FY_LABEL })}</h2><p>${t("cstatus.clientViewFor", { name: caEsc(c.name) })}</p></header>
   <p class="muted" style="font-size:.84rem"><b>${t("cstatus.preview")}</b></p>
   <h3 style="font-size:.95rem">${t("cstatus.stepsHeader")}</h3><ol style="list-style:none;margin:0;padding:0">${steps}</ol>
   <h3 style="font-size:.95rem">${t("cstatus.stillNeeded")}</h3>${need}
   <h3 style="font-size:.95rem">${t("cstatus.caNote")}</h3><p>${st.note ? caEsc(st.note) : `<span class="muted">${t("cstatus.noNote")}</span>`}</p>
   <p class="muted" style="font-size:.8rem">${t("cstatus.disclaimer")}</p><p class="muted" style="font-size:.8rem">${t("cstatus.footer")}</p>
   <div class="cs-noprint" style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn" type="button" data-st-print="${c.id}">${ic("down")}${t("cstatus.printBtn")}</button><button class="btn ghost" type="button" data-st-view="0">${t("cstatus.closeBtn")}</button></div></section>`;
}
function caStatusView() {
  const cfg = CA_STATUS_CONFIG, vc = C.find((x) => x.id === caStatView);
  const rows = C.map((c) => {
    const st = caStatOf(c);
    const sel = `<select class="sel" data-st-stage="${c.id}" aria-label="${caEsc(t("cstatus.stageLabel", { name: caEsc(c.name) }))}">${cfg.stages.map((k) => `<option value="${k}"${st.stage === k ? " selected" : ""}>${t("cstatus.stage." + k)}</option>`).join("")}</select><div class="muted" style="font-size:.74rem">${st.edited ? t("cstatus.edited") : t("cstatus.suggested")}</div>`;
    const note = `<input class="sel" type="text" maxlength="${cfg.noteMax}" data-st-note="${c.id}" value="${caEsc(st.note)}" placeholder="${caEsc(t("cstatus.messagePlaceholder"))}" aria-label="${caEsc(t("cstatus.messageLabel", { name: caEsc(c.name) }))}">`;
    const acts = `<button class="btn ghost sm" type="button" data-st-view="${c.id}">${t("cstatus.viewBtn")}</button><button class="btn ghost sm" type="button" data-yreview="${c.id}">${ic("down")}${t("yreview.button")}</button>`;
    return { c, sel, note, acts };
  });
  return `<div class="cs-admin"><div class="ph"><h1>${t("cstatus.title")}</h1><span class="pill">${t("cstatus.demo")}</span></div><p class="muted" style="font-size:.86rem">${t("cstatus.sub")}</p><p class="cs-noprint"><button class="btn ghost" type="button" data-st-csv="1">${ic("down")}${t("cstatus.csvBtn")}</button></p>
  <div class="grid" role="region" aria-label="${t("cstatus.title")}" style="max-height:none"><table><thead><tr><th>${t("cstatus.colClient")}</th><th>${t("cstatus.colStage")}</th><th>${t("cstatus.colMessage")}</th><th>${t("cstatus.colAction")}</th></tr></thead><tbody>${rows.map((r) => `<tr data-st-row="${r.c.id}"><td class="cname">${caEsc(r.c.name)}</td><td>${r.sel}</td><td>${r.note}</td><td><div style="display:flex;gap:.3rem;flex-wrap:wrap">${r.acts}</div></td></tr>`).join("")}</tbody></table></div>
  <div class="cards" role="list" aria-label="${t("cstatus.title")}">${rows.map((r) => `<article class="ccard" role="listitem" data-st-row="${r.c.id}"><div class="h"><b>${caEsc(r.c.name)}</b></div><span>${r.sel}</span><span>${r.note}</span><div style="display:flex;gap:.3rem;flex-wrap:wrap">${r.acts}</div></article>`).join("")}</div>
  <p class="muted" style="font-size:.78rem">${t("cstatus.sampleNote")}</p></div>${vc ? caStatClientView(vc) : ""}${CA_DISC}`;
}
function caStatusCsvRows() {
  const rows = C.map((c) => { const st = caStatOf(c); return [c.name, t("cstatus.stage." + st.stage), st.note]; });
  return [[t("cstatus.title") + " — " + TaxEngine.FY_LABEL], [t("cstatus.csvNote")], [], [t("cstatus.colClient"), t("cstatus.colStage"), t("cstatus.colMessage")], ...rows, [], [t("cstatus.footer")]];
}
// Year in review: counts from AUDIT + engine figures. PAN last 4 only.
function caMaskPan4(p) { return "XXXXXX" + String(p).replace(/[^A-Za-z0-9]/g, "").slice(-4); }
function buildYearReviewData(c, now = Date.now()) {
  const fmt = (ms) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const mine = AUDIT.filter((a) => a.c === c.id), n = (ty) => mine.filter((a) => a.type === ty).length;
  const open = Q.filter((q) => q.c === c.id && q.state === "open");
  const flags = [];
  mine.filter((a) => a.flag).forEach((a) => flags.push(t("yreview.flagReceipt", { receipt: a.what, flag: a.flag })));
  open.filter((q) => caRuleFlag(q)).forEach((q) => flags.push(t("yreview.flagReceipt", { receipt: q.who, flag: caRuleFlag(q) })));
  const ef = caElectionFlag(c); if (ef) flags.push(t("yreview.flagRegime", { elected: c.elected, better: ef.better }));
  if (caLandlordFlag(c)) flags.push(t("yreview.flagLandlord", { rent: "Rs. " + Math.round(c.rent).toLocaleString("en-IN") }));
  const d = clientDocs(c), r = clientReturn(c), nt = caNotices.filter((x) => x.c === c.id), ntDone = nt.filter((x) => x.status !== "open").length;
  const counts = [[t("yreview.receiptsReviewed"), String(mine.length)], [t("yreview.receiptsApproved"), String(n("approve"))], [t("yreview.receiptsQueried"), String(n("query"))], [t("yreview.receiptsRejected"), String(n("reject"))], [t("yreview.receiptsOpen"), String(open.length)], [t("yreview.flagsCaught"), String(flags.length)], [t("yreview.docsOnFile"), d.need.length ? t("yreview.docsOf", { got: d.got.length, need: d.need.length }) : "–"]];
  const oldBetter = c.rc > 0 && regimeForClient(c).better === "Old";
  const room = oldBetter ? caRoomSecs().map((s) => [caRoomName(s), "Rs. " + Math.round(c[s.key]).toLocaleString("en-IN"), "Rs. " + Math.round(s.cap).toLocaleString("en-IN"), "Rs. " + Math.round(Math.max(0, s.cap - c[s.key])).toLocaleString("en-IN")]) : [];
  return {
    title: t("yreview.title", { name: c.name, fy: TaxEngine.FY_LABEL }), generated: t("yreview.generated", { time: fmt(now), who: CA_USER }),
    demo: c.imported ? "" : t("yreview.demo"), pan: t("yreview.pan", { pan: caMaskPan4(c.pan) }), intro: t("yreview.intro"), caNote: t("yreview.caNote"),
    counts, deadlines: [t("yreview.returnDue", { form: r.form, date: r.date }), nt.length ? t("yreview.noticesMet", { done: ntDone, total: nt.length }) : t("yreview.noticesNone")],
    flags, flagsNone: t("yreview.flagsNone"), room, roomNone: t("yreview.roomNewRegime"), roomNote: t("yreview.roomNote"), footer: t("yreview.footer"),
    filename: "TaxPlot_Year_In_Review_" + c.name.replace(/\W+/g, "_") + ".pdf",
  };
}
async function caExportYearReview(id) {
  const c = C.find((x) => x.id === id); if (!c) return;
  const data = buildYearReviewData(c);
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) await caLoadScript(CA_PDF_LIBS.jspdf);
    if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await caLoadScript(CA_PDF_LIBS.autotable);
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    let y = 50; const para = (txt) => { const w = doc.splitTextToSize(txt, 515); if (y + w.length * 12 > 780) { doc.addPage(); y = 50; } doc.text(w, 40, y); y += w.length * 12 + 2; };
    const head = (txt) => { y += 8; if (y > 760) { doc.addPage(); y = 50; } doc.setFont(undefined, "bold"); doc.text(txt, 40, y); doc.setFont(undefined, "normal"); y += 14; };
    doc.setFontSize(16); doc.setFont(undefined, "bold"); doc.text(data.title, 40, y); y += 20;
    doc.setFontSize(9); doc.setFont(undefined, "normal"); para(data.generated); para(data.pan); if (data.demo) para(data.demo); y += 4; para(data.intro); para(data.caNote);
    head(t("yreview.headerCounts"));
    doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, head: [[t("yreview.colItem"), t("yreview.colValue")]], body: data.counts, theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } }); y = doc.lastAutoTable.finalY + 8;
    head(t("yreview.deadlinesHeader")); data.deadlines.forEach(para);
    head(t("yreview.flagsHeader")); (data.flags.length ? data.flags : [data.flagsNone]).forEach(para);
    head(t("yreview.roomHeader"));
    if (data.room.length) { doc.autoTable({ startY: y, margin: { left: 40, right: 40 }, head: [[t("yreview.roomColSection"), t("yreview.roomColLogged"), t("yreview.roomColCap"), t("yreview.roomColLeft")]], body: data.room, theme: "grid", styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } }); y = doc.lastAutoTable.finalY + 8; para(data.roomNote); } else para(data.roomNone);
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(data.footer, 40, 810, { maxWidth: 515 }); doc.setTextColor(0); }
    doc.save(data.filename);
  } catch (e) { console.error("Year in review PDF failed:", e); caToast(t("yreview.failed")); }
}
function caStatPrint() { document.body.classList.add("print-status"); const done = () => document.body.classList.remove("print-status"); window.addEventListener("afterprint", done, { once: true }); try { window.print(); } catch (e) { done(); } }

// ---------- Annual plan tracker (CA workspace) ----------
// Milestones come from TaxEngine.DEADLINES rows flagged `plan: true` (dates live only in tax-engine.js,
// each // VERIFY). A tick means "marked done by the CA" on a date the CA entered by clicking: never filed,
// paid or accepted. No penalty/interest text. Rows Comply listed as UNCONFIRMED are not built.
const CA_PLAN_CONFIG = { storeKey: "taxplot.ca.annualPlan" };
var caPlan = {}, caPlanClient = 0; // caPlan: { [clientId]: { [rowKey]: "YYYY-MM-DD" } }; var for tests
function caPlanLoad() {
  try {
    const o = JSON.parse(localStorage.getItem(CA_PLAN_CONFIG.storeKey) || "{}");
    if (o && typeof o === "object") Object.keys(o).forEach((id) => { const m = o[id]; if (m && typeof m === "object") { caPlan[id] = {}; Object.keys(m).forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(m[k])) caPlan[id][k] = m[k]; }); } });
  } catch (e) {}
}
function caPlanSave() { try { localStorage.setItem(CA_PLAN_CONFIG.storeKey, JSON.stringify(caPlan)); } catch (e) {} }
function caPlanRows(c) {
  return TaxEngine.DEADLINES.filter((d) => d.plan && (!d.appliesTo || (d.appliesTo === "salaried") === (c.type === "Salaried")));
}
function caPlanToggle(id, key) {
  const m = caPlan[id] || (caPlan[id] = {});
  if (m[key]) delete m[key]; else m[key] = caLocalISO();
  caPlanSave();
}
function caPlanFmt(iso) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function caPlanWho(d) { return d.key === "invest" ? t("plan.investWho") : /^itr/.test(d.key) ? t("plan.itrNote") : d.who; }
function caPlanView() {
  const c = C.find((x) => x.id === caPlanClient) || C[0];
  if (!c) return `<div class="ph"><h1>${t("plan.title")}</h1></div>`;
  const rows = caPlanRows(c), mine = caPlan[c.id] || {}, done = rows.filter((d) => mine[d.key]).length, rc = TaxEngine.TAX_CONFIG.rentTDS;
  const body = rows.map((d) => {
    const on = !!mine[d.key], passed = caDays(d) < 0;
    const tick = `<input type="checkbox" class="chk" data-plan-tick="${c.id}:${d.key}"${on ? " checked" : ""} aria-label="${caEsc(t("plan.tickAria", { what: d.label }))}">`;
    const dt = `<span class="num">${caPlanFmt(d.date)}</span>${d.verify ? ` <span class="pill">${t("plan.tbc")}</span>` : ""}${passed ? ` <span class="pill">${t("plan.datePassed")}</span>` : ""}`;
    return { tick, d, dt, who: caPlanWho(d), mark: on ? t("plan.markedOn", { date: caPlanFmt(mine[d.key]) }) : t("plan.notMarked") };
  });
  const opts = C.map((x) => `<option value="${x.id}"${x.id === c.id ? " selected" : ""}>${caEsc(x.name)}</option>`).join("");
  return `<section class="cs-print" data-plan-view="${c.id}"><div class="ph"><h1>${t("plan.title")}</h1><span class="pill">${t("plan.sample")}</span></div>
  <p class="muted cs-noprint" style="font-size:.86rem">${t("plan.sub")}</p>
  <h2 class="print-only-title" style="font-size:1rem;margin:.2rem 0">${t("plan.printTitle", { name: caEsc(c.name), fy: TaxEngine.FY_LABEL })} · ${t("plan.printPan", { pan: caMaskPan4(c.pan) })}</h2>
  <div class="cs-noprint" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.5rem 0"><label for="plan-client" class="muted">${t("plan.clientLabel")}</label><select class="sel" id="plan-client" data-plan-client="1">${opts}</select><button class="btn" type="button" data-plan-print="${c.id}">${ic("down")}${t("plan.printBtn")}</button><button class="btn ghost" type="button" data-plan-csv="${c.id}">${ic("down")}${t("plan.csvBtn")}</button></div>
  <p class="muted" style="font-size:.86rem"><b>${t("plan.kpi", { done, total: rows.length })}</b></p>
  <div class="grid" style="max-height:none"><table><thead><tr><th>${t("plan.colDone")}</th><th>${t("plan.colMilestone")}</th><th>${t("plan.colDate")}</th><th>${t("plan.colMarked")}</th></tr></thead><tbody>${body.map((r) => `<tr data-plan-row="${r.d.key}"><td>${r.tick}</td><td><b>${r.d.label}</b><div class="muted" style="font-size:.8rem">${r.who}</div></td><td>${r.dt}</td><td>${r.mark}</td></tr>`).join("")}</tbody></table></div>
  <div class="cards" role="list" aria-label="${t("plan.title")}">${body.map((r) => `<article class="ccard" role="listitem"><div class="h"><b>${r.d.label}</b>${r.tick}</div><span class="muted sub">${r.who}</span><span class="num">${r.dt}</span><span class="muted sub">${r.mark}</span></article>`).join("")}</div>
  <p class="muted" style="font-size:.8rem">${t("plan.dateOnRecord")}</p>
  <h3 style="font-size:.95rem">${t("plan.tbcHeader")}</h3><ul class="muted" style="font-size:.84rem"><li>${t("plan.tbcRevised")}</li><li>${t("plan.tbcRent", { secNew: rc.sectionNew, secOld: rc.sectionOld, formNew: rc.formNew, formOld: rc.formOld })}</li><li>${t("plan.tbcOther")}</li></ul>
  <p class="muted" style="font-size:.8rem">${t("plan.note")}</p><p class="muted" style="font-size:.8rem">${t("plan.footer")}</p></section>`;
}
function caPlanCsvRows(c) {
  const mine = caPlan[c.id] || {};
  return [[t("plan.printTitle", { name: c.name, fy: TaxEngine.FY_LABEL })], [t("plan.csvNote")], [], [t("plan.colMilestone"), t("plan.colDate"), t("plan.tbc"), t("plan.colMarked")],
    ...caPlanRows(c).map((d) => [d.label, d.date, d.verify ? t("plan.tbc") : "", mine[d.key] ? t("plan.markedOn", { date: caPlanFmt(mine[d.key]) }) : t("plan.notMarked")]), [], [t("plan.footer")]];
}
function caPlanPrint() { document.body.classList.add("print-plan"); const done = () => document.body.classList.remove("print-plan"); window.addEventListener("afterprint", done, { once: true }); try { window.print(); } catch (e) { done(); } }

// ---------- render ----------
function caRender() {
  // Keep keyboard focus on the control that was just pressed (issue #11): the view is rebuilt
  // from scratch, so remember which data-* control had focus (and which of its twins) and refocus it.
  let focusSel = "", focusIdx = -1;
  const ae = document.activeElement;
  // F1: the pressed control can vanish (queue row actioned, client deleted); remember where it was so focus lands on a sensible neighbour.
  let qHint = null, delHint = false;
  if (ae && ae.dataset && ae.dataset.q !== undefined) { const row = ae.closest("[data-qrow]"); if (row) { const sibs = [...row.parentNode.children].filter((x) => x.hasAttribute("data-qrow")); qHint = { tag: row.tagName.toLowerCase(), i: sibs.indexOf(row) }; } }
  if (ae && ae.dataset && ae.dataset.delClient !== undefined) delHint = true;
  if (ae && ae.dataset) {
    for (const k of ["invStep", "qall", "room", "bulk", "rulewin", "season", "imp", "ntcAdd", "ntcDel", "ntcStatus", "evnotice", "stStage", "stNote", "stView", "stPrint", "planTick", "docTick", "delClient", "dat", "planClient", "planPrint", "planCsv", "stCsv", "yreview", "filt", "sort", "go", "set", "toggle"]) {
      if (ae.dataset[k] !== undefined) { focusSel = `[data-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}="${ae.dataset[k]}"]` + (k === "set" ? `[data-val="${ae.dataset.val}"]` : ""); focusIdx = [...document.querySelectorAll(focusSel)].indexOf(ae); break; }
    }
  }
  document.getElementById("rail").innerHTML = CA_NAV.map(([g, items]) => `<span class="grp eyebrow">${g}</span>` + items.map(([k, i, t]) => `<button class="nav" type="button" data-go="${k}"${caView === k ? ' aria-current="page"' : ""}>${ic(i)}${t}${k === "queue" ? `<span class="badge">${Q.filter((q) => q.state === "open").length}</span>` : ""}</button>`).join("")).join("");
  const v = (CA_VIEWS[caView] || CA_VIEWS.clients)();
  const ct = document.getElementById("content");
  ct.classList.toggle("nodetail", !v.detail);
  ct.innerHTML = `<section class="pane">${v.main}</section>${v.detail ? caDetail() : ""}`;
  const q = document.getElementById("theme-quick");
  q.innerHTML = ic(CS.theme === "dark" ? "moon" : CS.theme === "light" ? "sun" : "auto");
  q.title = t("theme.label", { theme: CS.theme });
  document.getElementById("statusbar").innerHTML = `<span><span class="dot"></span>${t("statusbar.synced")}</span><span>${TaxEngine.FY_LABEL}</span><span>${t("statusbar.sampleData")}</span><span class="sp">${CS.shortcuts ? `<span class="kbhint">${t("statusbar.searchHint")}</span>` : ""}<span>${t("statusbar.disclaimer")}</span></span>`;
  // Task 4 hardcoded-value sweep: ca.html used to hardcode "FY 2026-27" as a
  // literal <option> — read it from TAX_CONFIG instead, same as everywhere else.
  document.getElementById("fy").innerHTML = `<option>${TaxEngine.FY_LABEL}</option>`;
  if (focusSel && focusIdx >= 0) { const n = document.querySelectorAll(focusSel)[focusIdx]; if (n) { n.focus(); return; } }
  if (qHint) {
    const rows = document.querySelectorAll(qHint.tag + "[data-qrow]");
    const btn = rows.length ? rows[Math.min(qHint.i, rows.length - 1)].querySelector('[data-q="approve"]') : null;
    if (btn) { btn.focus(); return; }
  }
  if (qHint || delHint) { const h = document.querySelector("#content h1, #content h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }
}
function caGo(v) { caView = v; caRender(); }
function caAct(type, id) {
  const q = Q.find((x) => x.id === id);
  if (!q) return;
  q.state = type;
  AUDIT.push({ c: q.c, type, user: CA_USER, at: Date.now(), reason: type === "approve" ? "" : caReason.trim(), what: q.who, sec: q.sec, flag: caRuleFlag(q) });
  caReason = ""; caReviewSave();
  const open = caQVisible();
  caQSel = open[0] ? open[0].id : undefined;
  syncReviewCounts();
  caToast(type === "approve" ? t("review.approved") : type === "query" ? t("review.querySent") : t("review.rejected"));
  caRender();
}
document.addEventListener("click", (e) => {
  const im = e.target.closest("[data-imp]"); if (im) { const a = im.dataset.imp; if (a === "template") caImportDownloadTemplate(); else if (a === "import") caImportCommit(); else if (a === "clear") { caImp = null; caImpErr = ""; caRender(); } else if (a === "remove") { if (!caImpConfirm) { caImpConfirm = true; caRender(); } else { const n = C.filter((c) => c.imported).length; C = C.filter((c) => !c.imported); caNotices = caNotices.filter((x) => C.some((c) => c.id === x.c)); caNtcSave(); caImpConfirm = false; caImportSave(); caToast(t("import.removed")); caSel = (C[0] || {}).id; caRender(); } } return; }
  if (e.target.closest("[data-ntc-add]")) { caNtcAdd(); return; }
  const nd = e.target.closest("[data-ntc-del]"); if (nd) { caNotices = caNotices.filter((x) => x.id !== +nd.dataset.ntcDel); caNtcSave(); caToast(t("notice.deleted")); caRender(); return; }
  const en = e.target.closest("[data-evnotice]"); if (en) { caNtcEvidence(+en.dataset.evnotice); return; }
  const is = e.target.closest("[data-inv-step]"); if (is) { caInvStep = +is.dataset.invStep; caRender(); return; }
  const sv = e.target.closest("[data-st-view]"); if (sv) { caStatView = +sv.dataset.stView; caRender(); return; }
  if (e.target.closest("[data-st-print]")) { caStatPrint(); return; }
  if (e.target.closest("[data-plan-print]")) { caPlanPrint(); return; }
  const pcv = e.target.closest("[data-plan-csv]"); if (pcv) { const c = C.find((x) => x.id === +pcv.dataset.planCsv); if (c) caDownloadCsv(caPlanCsvRows(c), "TaxPlot_Annual_Plan_" + c.name.replace(/\W+/g, "_") + ".csv"); return; }
  if (e.target.closest("[data-st-csv]")) { caDownloadCsv(caStatusCsvRows(), "TaxPlot_Client_Status.csv"); return; }
  const dl = e.target.closest("[data-del-client]"); if (dl) { const id = +dl.dataset.delClient; if (caDelConfirm !== id) { caDelConfirm = id; caRender(); } else caDeleteClient(id); return; }
  const da = e.target.closest("[data-dat]"); if (da) { const a = da.dataset.dat; if (a === "backup") caBackupDownload(); else if (a === "clear") { if (!caClearConfirm) { caClearConfirm = true; caRender(); } else caClearAllData(); } return; }
  const dt = e.target.closest("[data-doc-tick]"); if (dt) { const [did, dk] = dt.dataset.docTick.split(":"); caDocsToggle(+did, dk); caRender(); return; }
  const pt = e.target.closest("[data-plan-tick]"); if (pt) { const [pid, pk] = pt.dataset.planTick.split(":"); caPlanToggle(+pid, pk); caRender(); return; }
  const yr = e.target.closest("[data-yreview]"); if (yr) { caExportYearReview(+yr.dataset.yreview); return; }
  const rr = e.target.closest("[data-readiness]"); if (rr) { caExportReadinessRecord(+rr.dataset.readiness); return; }
  const ev = e.target.closest("[data-evidence]"); if (ev) { caExportEvidencePack(+ev.dataset.evidence); return; }
  const qa = e.target.closest("[data-qall]"); if (qa) { caQShowAll = !caQShowAll; caRender(); return; }
  const rm = e.target.closest("[data-room]"); if (rm) { caRoom = caRoom === rm.dataset.room ? "" : rm.dataset.room; caRender(); return; }
  const rw = e.target.closest("[data-rulewin]"); if (rw) { caRuleWin = +rw.dataset.rulewin; caRender(); return; }
  const se = e.target.closest("[data-season-export]"); if (se) { se.dataset.seasonExport === "csv" ? caExportSeasonCsv() : caExportSeasonPdf(); return; }
  const sf = e.target.closest("[data-season]"); if (sf) { caSeasonFilt = sf.dataset.season; caRender(); return; }
  const bk = e.target.closest("[data-bulk]"); if (bk) { caBulk = caBulk === bk.dataset.bulk ? "" : bk.dataset.bulk; caRender(); return; }
  const g = e.target.closest("[data-go]"); if (g) { caGo(g.dataset.go); return; }
  const f = e.target.closest("[data-filt]"); if (f) { caFilt = f.dataset.filt; if (caView !== "clients") caView = "clients"; caRender(); return; }
  const s = e.target.closest("[data-sort]"); if (s) { const k = s.dataset.sort; caSortDir = caSortKey === k ? -caSortDir : 1; caSortKey = k; caRender(); return; }
  const qb = e.target.closest("[data-q]"); if (qb) { caAct(qb.dataset.q, +qb.dataset.id); return; }
  if (e.target.closest("input,textarea,select")) return;
  const r = e.target.closest("[data-row]"); if (r) { caSel = +r.dataset.row; caRender(); return; }
  const qr = e.target.closest("[data-qrow]"); if (qr) { caQSel = +qr.dataset.qrow; caRender(); return; }
  const st = e.target.closest("[data-set]"); if (st) { caSet(st.dataset.set, st.dataset.val); return; }
  const tg = e.target.closest("[data-toggle]"); if (tg) { caSet(tg.dataset.toggle, !CS[tg.dataset.toggle]); return; }
  const tt = e.target.closest("[data-toast]"); if (tt) { caToast(tt.dataset.toast); return; }
  const a = e.target.closest("[data-act]"); if (a && a.dataset.act === "reset") { Object.assign(CS, CA_DEFAULTS); caSave(); caApplyAppearance(); caRender(); caToast(t("common.settingsReset")); }
});
document.getElementById("theme-quick").addEventListener("click", () => { const order = ["auto", "light", "dark"]; caSet("theme", order[(order.indexOf(CS.theme) + 1) % 3]); caToast(t("theme.label", { theme: CS.theme })); });
document.addEventListener("change", (e) => {
  if (e.target.id === "ca-lowConf") caSet("lowConf", +e.target.value);
  if (e.target.id === "ca-restore-file") { caRestoreFile(e.target.files && e.target.files[0]); return; }
  if (e.target.id === "ca-import-file") { caImportFile(e.target.files && e.target.files[0]); return; }
  const pc = e.target.dataset && e.target.dataset.planClient; if (pc) { caPlanClient = +e.target.value; caRender(); return; }
  const ss = e.target.dataset && e.target.dataset.stStage; if (ss) { if (CA_STATUS_CONFIG.stages.includes(e.target.value)) { caStatSet(+ss, { stage: e.target.value }); caRender(); } return; }
  const sn = e.target.dataset && e.target.dataset.stNote; if (sn) { caStatSet(+sn, { note: e.target.value.slice(0, CA_STATUS_CONFIG.noteMax) }); caRender(); return; }
  const ns = e.target.dataset && e.target.dataset.ntcStatus; if (ns) { const n = caNotices.find((x) => x.id === +ns); if (n && CA_NOTICE_CONFIG.statuses.includes(e.target.value)) { n.status = e.target.value; caNtcSave(); caRender(); } }
});
document.addEventListener("input", (e) => { const f = e.target.dataset && e.target.dataset.nf; if (f in caNtcDraft) caNtcDraft[f] = e.target.value; });
document.addEventListener("change", (e) => { const f = e.target.dataset && e.target.dataset.nf; if (f in caNtcDraft) caNtcDraft[f] = e.target.value; });
document.addEventListener("input", (e) => { if (e.target && e.target.id === "qreason") caReason = e.target.value; });
document.getElementById("q").addEventListener("input", (e) => { caQuery = e.target.value; if (caView !== "clients") caView = "clients"; caRender(); });
document.addEventListener("keydown", (e) => {
  if (!CS.shortcuts || e.target.closest("input,textarea,select")) return;
  if (e.key === "/") { e.preventDefault(); document.getElementById("q").focus(); return; }
  const list = caView === "queue" ? caQVisible().map((q) => q.id) : caView === "clients" ? [...document.querySelectorAll(".grid [data-row]")].map((r) => +r.dataset.row) : [];
  if (!list.length) return;
  const cur = caView === "queue" ? caQSel : caSel, i = Math.max(0, list.indexOf(cur));
  if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); const n = list[Math.min(list.length - 1, i + 1)]; caView === "queue" ? (caQSel = n) : (caSel = n); caRender(); }
  if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); const n = list[Math.max(0, i - 1)]; caView === "queue" ? (caQSel = n) : (caSel = n); caRender(); }
  if (caView === "queue") { if (e.key === "a") caAct("approve", caQSel); if (e.key === "q") caAct("query", caQSel); if (e.key === "r") caAct("reject", caQSel); }
});
if (typeof matchMedia === "function") {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", caRender);
}
let caToastTimer;
function caToast(m) {
  let elx = document.querySelector(".toast");
  if (!elx) return;
  elx.textContent = m;
  elx.classList.add("show");
  clearTimeout(caToastTimer);
  caToastTimer = setTimeout(() => elx.classList.remove("show"), 2000);
}
caImportLoad(); caNtcLoad(); caStatLoad(); caPlanLoad(); caDocsLoad(); caReviewLoad(); syncReviewCounts();
caApplyAppearance();
caRender();

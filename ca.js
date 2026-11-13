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
function regimeForClient(c) {
  // Client sample data stores a precomputed HRA exemption, not rent/city —
  // pass it straight through via exemptOverride instead of recomputing it.
  const cmp = TaxEngine.compareRegimes({
    grossIncome: c.inc,
    receipts: clientReceipts(c),
    hraContext: { exemptOverride: c.hra },
    section126Options: {},
  });
  return { old: cmp.oldTax, neu: cmp.newTax, better: cmp.betterRegime === "old" ? "Old" : "New", gap: cmp.savingsIfBetter };
}
// Regime-election consistency flag (NEXT_STEPS research item 4): informational only. Compares the regime on
// record with the engine estimate; never changes or submits an election.
function caElectionFlag(c) {
  if (c.rc === 0) return null;
  const r = regimeForClient(c);
  return r.gap > 0 && r.better !== c.elected ? r : null;
}
// Landlord-PAN completeness flag (research item 5): informational only. Threshold from TAX_CONFIG [VERIFY].
function caLandlordFlag(c) {
  return c.hra > 0 && c.rent > TaxEngine.TAX_CONFIG.landlordPanThresholdAnnualRent && !c.landlordPan;
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
const Q = [
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
function clientDocs(c) {
  const need = [];
  if (c.type === "Salaried") need.push("form130");
  need.push("ais");
  if (c.hra > 0) need.push("rent");
  if (c.s126 > 0) need.push("cert126");
  if (c.s126p > 0) need.push("cert126p");
  if (c.s22 > 0) need.push("homeLoan");
  if (c.s124 > 0) need.push("nps");
  if (c.s133 > 0) need.push("donation");
  if (c.type !== "Salaried") need.push("income");
  const got = need.filter((d) => c.rc > 0 && !(CA_DOCS_NOT_SENT[c.name] || []).includes(d) && (c.id * 2 + CA_DOC_KEYS.indexOf(d)) % 6 !== 0);
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

// Real today (midnight, UTC) so deadline countdowns are live. For demos/tests, ?today=YYYY-MM-DD overrides it.
const TODAY = (() => {
  const q = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search);
  const d = q ? new Date(q[1]) : new Date(new Date().toISOString().slice(0, 10));
  return isNaN(d) ? new Date(new Date().toISOString().slice(0, 10)) : d;
})();

// ---------- helpers ----------
function caInr(n) { return "₹" + Math.round(n).toLocaleString(CS.numFormat === "intl" ? "en-US" : "en-IN"); }
function caPan(p) { return CS.maskPan ? p.slice(0, 3) + "••••" + p.slice(-2) : p; }
const OLD_SEC_NO = { 123: "80C", 124: "80CCD(1B)", 126: "80D", 22: "24(b)", 133: "80G" };
function caSec(n) {
  if (n === "HRA") return "HRA";
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
  sort: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
};
function ic(n) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CA_ICONS[n] || ""}</svg>`; }
const CA_STATUS = { done: [t("status.done"), "check", "st-done"], room: [t("status.room"), "clock", "st-room"], soon: [t("status.soon"), "alert", "st-soon"], none: [t("status.none"), "dash", "st-none"], check: [t("status.check"), "eye", "st-check"] };
function chip(k, label) { return `<span class="chip ${CA_STATUS[k][2]}">${ic(CA_STATUS[k][1])}${label || CA_STATUS[k][0]}</span>`; }
function mm(u, cap) { const st = u >= cap ? "done" : u === 0 ? "none" : "room"; return `<div class="mm"><div class="meter ${st}">${st === "none" ? "" : `<i style="width:${Math.min(100, (u / cap) * 100)}%"></i>`}</div><span>${Math.round((Math.min(u, cap) / cap) * 100)}%</span></div>`; }

const CA_DISC = `<p class="disc">${ic("info")}${t("common.disclaimer")}</p>`;

// ---------- state ----------
const CA_NAV = [[t("nav.groupPractice"), [["dash", "home", t("nav.dashboard")], ["clients", "users", t("nav.clients")], ["queue", "inbox", t("nav.queue")]]], [t("nav.groupWork"), [["deadlines", "cal", t("nav.deadlines")], ["reports", "report", t("nav.reports")]]], [t("nav.groupFirm"), [["settings", "gear", t("nav.settings")]]]];
const AUDIT = [];
let caReason = "";
const CA_USER = "Ritu M.";
let caBulk = "", caRoom = "", caView = "clients", caSel = 1, caFilt = "all", caSortKey = "name", caSortDir = 1, caQuery = "", caQSel = 1;

// ---------- views ----------
function caDocsText(c) { const d = clientDocs(c); return d.need.length ? t("clients.docsCount", { got: d.got.length, need: d.need.length }) : t("clients.docsNone"); }
function caDocsCell(c) { const d = clientDocs(c); return d.need.length ? mm(d.got.length, d.need.length).replace(/<span>\d+%<\/span>/, `<span class="num">${caDocsText(c)}</span>`) : `<span class="muted">${caDocsText(c)}</span>`; }
function caBulkPanel() {
  const counts = CA_DOC_KEYS.map((k) => [k, C.filter((c) => clientDocs(c).missing.includes(k))]);
  const chips = counts.map(([k, list]) => `<button class="fchip" type="button" data-bulk="${k}" aria-pressed="${caBulk === k}">${t("bulk.chip", { doc: t("docs." + k).split(/ [(—]/)[0], n: list.length })}</button>`).join("");
  const sel = counts.find(([k]) => k === caBulk);
  const list = !sel ? "" : sel[1].length ? `<p class="muted" style="font-size:.84rem">${t("bulk.listHeader", { n: sel[1].length, doc: t("docs." + sel[0]) })}</p><div class="bulk-list">${sel[1].map((c) => `<div class="row"><span>${c.name}</span><a class="btn ghost sm" href="${caWaLink(c, [sel[0]])}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("bulk.ask")}</a></div>`).join("")}</div><p class="muted" style="font-size:.78rem">${t("bulk.note")}</p>` : `<p class="muted">${t("bulk.none")}</p>`;
  return `<section class="cardx bulk"><header><h2>${t("bulk.title")}</h2><p>${t("bulk.sub")}</p></header><div class="fbar">${chips}</div>${list}</section>`;
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
function caRoomPanel() {
  const secs = caRoomSecs(), sel = secs.find((s) => s.id === caRoom);
  const chips = secs.map((s) => `<button class="fchip" type="button" data-room="${s.id}" aria-pressed="${caRoom === s.id}">${t("room.chip", { sec: caRoomName(s), n: caRoomList(s).length })}</button>`).join("");
  let list = "";
  if (sel) {
    const rows = caRoomList(sel).sort((a, b) => (sel.cap - b[sel.key]) - (sel.cap - a[sel.key]));
    const wa = (txt) => "https://wa.me/?text=" + encodeURIComponent(txt);
    list = rows.length ? `<p class="muted" style="font-size:.84rem">${t("room.listHeader", { n: rows.length, sec: caRoomName(sel) })}</p><div class="bulk-list">${rows.map((c) => `<div class="row"><span>${c.name} <span class="muted num">${t("room.row", { amount: caInr(sel.cap - c[sel.key]), cap: caInr(sel.cap) })}</span></span><a class="btn ghost sm" href="${wa(caRoomMsg(c, sel))}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("room.ask")}</a></div>`).join("")}</div><div style="padding:.2rem 1rem .4rem"><a class="btn sm" data-roomall href="${wa(t("room.messageAll", { fy: TaxEngine.FY_LABEL, sec: caRoomName(sel), cap: caInr(sel.cap) }))}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("room.bulkAsk", { n: rows.length })}</a></div><p class="muted" style="font-size:.78rem">${t("room.bulkNote")}</p>` : `<p class="muted">${t("room.none")}</p>`;
  }
  return `<section class="cardx bulk room"><header><h2>${t("room.title")}</h2><p>${t("room.sub")}</p></header><div class="fbar">${chips}</div>${secs.every((x) => !caRoomList(x).length) ? `<p class="muted" style="font-size:.84rem">${t("room.noneOldRegime")}</p>` : ""}${list}</section>`;
}
function caClientTable() {
  let rows = C.filter((c) => (caFilt === "all" || (caFilt === "docs" ? clientDocs(c).missing.length > 0 : caFilt === "landlord" ? caLandlordFlag(c) : caFilt === "election" ? !!caElectionFlag(c) : caFilt === "itr12" || caFilt === "itr34" ? clientReturn(c).key === caFilt : clientStatus(c) === caFilt || c.type === caFilt)) && (!caQuery || (c.name + c.pan).toLowerCase().includes(caQuery.toLowerCase())));
  rows.sort((a, b) => { const va = caSortKey === "regime" ? regimeForClient(a).gap : a[caSortKey], vb = caSortKey === "regime" ? regimeForClient(b).gap : b[caSortKey]; return (va > vb ? 1 : va < vb ? -1 : 0) * caSortDir; });
  const th = (k, label, cls = "") => `<th class="${cls}"><button type="button" data-sort="${k}" ${caSortKey === k ? `aria-sort="${caSortDir > 0 ? "ascending" : "descending"}"` : ""}>${label}${caSortKey === k ? ic("sort") : ""}</button></th>`;
  const f = [["all", t("clients.filterAll")], ["check", t("clients.filterCheck")], ["room", t("clients.filterRoom")], ["done", t("clients.filterDone")], ["none", t("clients.filterNone")], ["Salaried", t("clients.filterSalaried")], ["Freelancer", t("clients.filterFreelancer")], ["Gig worker", t("clients.filterGig")], ["docs", t("clients.filterDocs")], ["election", t("election.filter")], ["landlord", t("landlord.filter")], ["itr12", t("clients.filterDue", { date: caDueDate("itr12") })], ["itr34", t("clients.filterDue", { date: caDueDate("itr34") })]];
  return `<div class="fbar">${f.map(([k, label]) => `<button class="fchip" type="button" data-filt="${k}" aria-pressed="${caFilt === k}">${label}</button>`).join("")}<span class="count">${t("clients.countSummary", { shown: rows.length, total: C.length })}</span></div>
  <p class="muted" style="font-size:.78rem;margin:.1rem 0 .5rem">${t("returns.note")} ${t("election.note")} ${t("landlord.note")}</p>
  <div class="grid" role="region" aria-label="Clients"><table><thead><tr><th><input type="checkbox" class="chk" aria-label="${t("clients.selectAllAria")}"></th>${th("name", t("clients.colClient"))}<th>${t("clients.colPan")}</th>${th("inc", t("clients.colIncome"), "r")}${th("regime", t("clients.colLowerRegime"))}<th>${caSec("123")}</th><th>${caSec("126")}<div class="muted" style="font-weight:400;font-size:.72rem">${t("clients.col126split")}</div></th><th>${caSec("124")}</th><th>${t("clients.colDocs")}</th><th>${t("clients.colReturn")}</th>${th("rc", t("clients.colReceipts"), "r")}${th("rev", t("clients.colToReview"), "r")}<th>${t("clients.colStatus")}</th>${th("last", t("clients.colLastUpload"))}</tr></thead><tbody>
  ${rows.map((c) => { const r = regimeForClient(c); return `<tr data-row="${c.id}" aria-selected="${caSel === c.id}"><td><input type="checkbox" class="chk" aria-label="${t("clients.selectClientAria", { name: c.name })}"></td><td class="cname">${c.name}<small>${c.type}</small></td><td class="pan">${caPan(c.pan)}</td><td class="r num">${caInr(c.inc)}</td><td class="reg"><b>${r.better}</b> <span class="muted num">${t("clients.byAmount", { amount: caInr(r.gap) })}</span>${caElectionFlag(c) ? `<div>${chip("check", t("election.chip"))}</div>` : ""}</td><td>${mm(c.s123, TaxEngine.SECTION_CAPS.s123.cap)}</td><td><div title="${t("detail.gloss126self")}">${mm(c.s126, TaxEngine.SECTION_CAPS.s126Self.capUnder60)}</div><div title="${t("detail.gloss126parents")}">${mm(c.s126p, TaxEngine.SECTION_CAPS.s126Parents.capUnder60)}</div></td><td>${mm(c.s124, TaxEngine.SECTION_CAPS.s124.cap)}</td><td>${caDocsCell(c)}${caLandlordFlag(c) ? `<div>${chip("check", t("landlord.chip"))}</div>` : ""}</td><td class="num">${clientReturn(c).text}</td><td class="r num">${c.rc}</td><td class="r num" style="${c.rev ? "color:var(--warn);font-weight:600" : ""}">${c.rev || "–"}</td><td>${chip(clientStatus(c))}</td><td class="num muted">${c.last === "—" ? "—" : new Date(c.last).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td></tr>`; }).join("")}
  </tbody></table></div>
  <div class="cards" role="list" aria-label="${t("clients.title")}">${rows.map((c) => { const r = regimeForClient(c); return `<button type="button" class="ccard" role="listitem" data-row="${c.id}" aria-pressed="${caSel === c.id}"><span class="h"><b>${c.name}</b>${chip(clientStatus(c))}</span><span class="muted sub">${c.type} · <span class="pan">${caPan(c.pan)}</span></span>${caElectionFlag(c) ? `<span>${chip("check", t("election.chip"))}</span>` : ""}${caLandlordFlag(c) ? `<span>${chip("check", t("landlord.chip"))}</span>` : ""}<span class="kv"><span><span class="eyebrow">${t("clients.colIncome")}</span><span class="num">${caInr(c.inc)}</span></span><span><span class="eyebrow">${t("clients.colLowerRegime")}</span><span><b>${r.better}</b> <span class="muted num">${t("clients.byAmount", { amount: caInr(r.gap) })}</span></span></span><span><span class="eyebrow">${t("clients.colDocs")}</span><span class="num">${caDocsText(c)}</span></span><span><span class="eyebrow">${t("clients.colReturn")}</span><span class="num">${clientReturn(c).text}</span></span><span><span class="eyebrow">${t("clients.colReceipts")}</span><span class="num">${c.rc}</span></span><span><span class="eyebrow">${t("clients.colToReview")}</span><span class="num" style="${c.rev ? "color:var(--warn);font-weight:600" : ""}">${c.rev || "–"}</span></span></span></button>`; }).join("")}</div>`;
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
  return `<div style="display:grid;gap:.3rem"><span class="eyebrow">${t("detail.docsHeader", { got: d.got.length, need: d.need.length })}</span>${d.need.map((k) => `<div class="a" style="display:flex;justify-content:space-between;gap:.5rem;font-size:.84rem"><span>${t("docs." + k)}</span>${chip(d.got.includes(k) ? "done" : "room", d.got.includes(k) ? t("detail.docGot") : t("detail.docMissing"))}</div>`).join("")}</div>`;
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
   <div><span class="eyebrow">${t("detail.typeAndSample", { type: c.type })}</span><h2>${c.name}</h2></div>
   <dl class="dl"><dt>${t("detail.pan")}</dt><dd class="num">${caPan(c.pan)}</dd><dt>${t("detail.incomeDeclared")}</dt><dd class="num">${caInr(c.inc)}</dd><dt>${t("detail.receipts")}</dt><dd class="num">${t("detail.receiptsValue", { logged: c.rc, review: c.rev })}</dd><dt>${t("returns.detailLabel")}</dt><dd class="num">${clientReturn(c).text}</dd><dt>${t("detail.hraEstimate")}</dt><dd class="num">${c.hra ? caInr(c.hra) : t("detail.notClaimed")}</dd></dl>
   <div class="consent">${ic("shield")}<span>${t("detail.consentNote", { fy: TaxEngine.FY_LABEL })}</span></div>
   <div class="cmp"><div class="${r.better === "Old" ? "lower" : ""}"><span class="eyebrow">${t("detail.oldRegime")}</span><b>${caInr(r.old)}</b></div><div class="${r.better === "New" ? "lower" : ""}"><span class="eyebrow">${t("detail.newRegime")}</span><b>${caInr(r.neu)}</b></div></div>
   ${caDetailElection(c)}
   ${caDetailLandlord(c)}
   ${caDetailDocs(c)}
   ${ds("123", c.s123, TaxEngine.SECTION_CAPS.s123.cap)}${ds("124", c.s124, TaxEngine.SECTION_CAPS.s124.cap)}${ds("126", c.s126, TaxEngine.SECTION_CAPS.s126Self.capUnder60, t("detail.gloss126self"))}${ds("126", c.s126p, TaxEngine.SECTION_CAPS.s126Parents.capUnder60, t("detail.gloss126parents"))}${ds("22", c.s22, TaxEngine.SECTION_CAPS.s22.cap)}
   <div style="display:grid;gap:.45rem"><span class="eyebrow">${t("detail.waitingForReview", { n: items.length })}</span>
   ${items.length ? caReasonField() + items.map(caRvCard).join("") : `<p class="muted" style="font-size:.84rem">${t("detail.nothingToReview")}</p>`}</div>
   ${caActivity(c.id, 5)}
   <div style="display:grid;gap:.3rem"><label class="eyebrow" for="cnote">${t("detail.privateNoteLabel")}</label><textarea id="cnote" placeholder="${t("detail.privateNotePlaceholder")}"></textarea></div>
   <div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn" type="button" data-toast="${t("detail.exportSummaryToast")}">${ic("down")}${t("detail.exportSummary")}</button><button class="btn ghost" type="button" data-evidence="${c.id}">${ic("down")}${t("evidence.button")}</button>${clientDocs(c).missing.length ? `<a class="btn ghost" href="${caWaLink(c, clientDocs(c).missing)}" target="_blank" rel="noopener noreferrer">${ic("msg")}${t("detail.askClient")}</a>` : `<button class="btn ghost" type="button" data-toast="${t("detail.askClientToast")}">${ic("msg")}${t("detail.askClient")}</button>`}</div>
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
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js",
};
function caEvSecName(n) { return `Section ${n} (${OLD_SEC_NO[n]})`; }
function buildEvidencePackData(c) {
  const rows = [["123", "s123", c.s123], ["124", "s124", c.s124], ["126", "s126self", c.s126], ["126", "s126parents", c.s126p], ["22", "s22", c.s22], ["133", "s133", c.s133]];
  const sections = rows.filter((r) => r[2] > 0).map(([n, key, amount]) => ({ label: `${caEvSecName(n)} (${t("evidence.plain." + key)})`, amount, lastUpload: c.last }));
  return { title: t("evidence.title", { name: c.name, fy: TaxEngine.FY_LABEL }), intro: t("evidence.intro"), sections, empty: t("evidence.empty"), footer: t("evidence.footer"), filename: "TaxPlot_Evidence_Pack_" + c.name.replace(/\W+/g, "_") + ".pdf" };
}
function caLoadScript(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("load failed " + src)); document.head.appendChild(s); });
}
async function caExportEvidencePack(id) {
  const c = C.find((x) => x.id === id); if (!c) return;
  const data = buildEvidencePackData(c);
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

const CA_VIEWS = {
  clients() { return { main: `<div class="ph"><h1>${t("clients.title")}</h1><span class="pill">${t("common.sampleData")}</span><button class="btn ghost" type="button" data-toast="${t("clients.inviteToast")}">${t("clients.inviteClient")}</button><button class="btn" type="button" data-toast="${t("clients.exportToast")}">${ic("down")}${t("clients.export")}</button></div>${caKpis()}${caBulkPanel()}${caRoomPanel()}${caClientTable()}`, detail: true }; },
  dash() {
    const open = Q.filter((q) => q.state === "open");
    return { main: `<div class="ph"><h1>${t(caGreetingKey())}</h1><span class="muted" style="font-size:.85rem">${t("dash.practiceLine", { n: C.length })}</span></div>${caKpis()}
    <div class="two"><section class="cardx"><header><h2>${t("dash.nextDeadlines")}</h2><p>${t("dash.nextDeadlinesSub")}</p></header>${TaxEngine.DEADLINES.filter((d) => caDays(d) >= 0).slice(0, 3).map((d) => { const days = caDays(d); return `<div class="row"><div><span class="lbl">${d.label}</span><p class="help">${d.who}</p></div>${chip(days <= 45 ? "soon" : "room", t("dash.daysLabel", { n: days }))}</div>`; }).join("")}</section>
    <section class="cardx"><header><h2>${t("dash.lowConfidenceReceipts")}</h2><p>${t("dash.lowConfidenceSub")}</p></header>${open.slice().sort((a, b) => a.conf - b.conf).slice(0, 4).map((q) => `<div class="row"><div><span class="lbl">${q.who}</span><p class="help">${C.find((c) => c.id === q.c).name} · ${caSec(q.sec)}</p></div><span class="conf low">${q.conf}%</span></div>`).join("")}</section></div>
    <section class="cardx"><header><h2>${t("dash.regimePicture")}</h2><p>${t("dash.regimePictureSub")}</p></header><div class="row"><div><span class="lbl">${t("dash.newRegimeLower")}</span><p class="help">${C.filter((c) => c.rc && regimeForClient(c).better === "New").map((c) => c.name.split(" ")[0]).join(", ") || t("dash.noneYet")}</p></div><b class="num">${C.filter((c) => c.rc && regimeForClient(c).better === "New").length}</b></div><div class="row"><div><span class="lbl">${t("dash.oldRegimeLower")}</span><p class="help">${C.filter((c) => c.rc && regimeForClient(c).better === "Old").map((c) => c.name.split(" ")[0]).join(", ") || t("dash.noneYet")}</p></div><b class="num">${C.filter((c) => c.rc && regimeForClient(c).better === "Old").length}</b></div></section>`, detail: false };
  },
  queue() {
    const open = Q.filter((q) => q.state === "open");
    return { main: `<div class="ph"><h1>${t("queue.title")}</h1><span class="muted" style="font-size:.85rem">${CS.shortcuts ? t("queue.shortcutsHint") : ""}</span></div>
    ${open.length ? caReasonField() : ""}
    <div class="grid"><table><thead><tr><th>${t("queue.colClient")}</th><th>${t("queue.colReceipt")}</th><th>${t("queue.colCounts")}</th><th class="r">${t("queue.colAmount")}</th><th>${t("queue.colConfidence")}</th><th>${t("queue.colCheck")}</th><th>${t("queue.colUploaded")}</th><th>${t("queue.colAction")}</th></tr></thead><tbody>
    ${open.length ? open.map((q) => `<tr data-qrow="${q.id}" aria-selected="${caQSel === q.id}"><td class="cname">${C.find((c) => c.id === q.c).name}</td><td>${q.who}</td><td>${caSec(q.sec)}</td><td class="r num">${caInr(q.amt)}</td><td><span class="conf ${q.conf < CS.lowConf ? "low" : ""}">${q.conf}%</span></td><td>${caRuleFlag(q) ? chip("check", caRuleFlag(q)) : q.field ? chip("check", q.field) : "<span class='muted'>–</span>"}</td><td class="num muted">${new Date(q.d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td><td><div style="display:flex;gap:.3rem"><button class="btn sm" type="button" data-q="approve" data-id="${q.id}">${t("review.approve")}</button><button class="btn ghost sm" type="button" data-q="query" data-id="${q.id}">${t("review.query")}</button></div></td></tr>`).join("") : `<tr><td colspan="8" style="text-align:center;padding:2rem">${chip("done", t("queue.queueClear"))}</td></tr>`}
    </tbody></table></div>
    <div class="cards" role="list" aria-label="${t("queue.title")}">${open.length ? open.map((q) => `<article class="ccard" role="listitem" data-qrow="${q.id}" aria-current="${caQSel === q.id}"><div class="h"><b>${C.find((c) => c.id === q.c).name}</b><span class="num">${caInr(q.amt)}</span></div><div class="sub">${q.who}</div><div class="muted sub">${caSec(q.sec)} · ${new Date(q.d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · <span class="conf ${q.conf < CS.lowConf ? "low" : ""}">${t("review.readPct", { conf: q.conf })}</span></div>${caRuleFlag(q) ? `<div>${chip("check", caRuleFlag(q))}</div>` : q.field ? `<div>${chip("check", q.field)}</div>` : ""}<div class="acts"><button class="btn sm" type="button" data-q="approve" data-id="${q.id}">${ic("check")}${t("review.approve")}</button><button class="btn ghost sm" type="button" data-q="query" data-id="${q.id}">${ic("msg")}${t("review.query")}</button><button class="btn warn sm" type="button" data-q="reject" data-id="${q.id}">${ic("x")}${t("review.reject")}</button></div></article>`).join("") : `<div style="text-align:center;padding:1.5rem">${chip("done", t("queue.queueClear"))}</div>`}</div>${caActivity(null, 8)}<p class="muted" style="font-size:.8rem">${t("queue.footerNote")}</p>`, detail: false };
  },
  deadlines() { return { main: `<div class="ph"><h1>${t("deadlines.title")}</h1><span class="chip st-check">${ic("eye")}${t("deadlines.verifyChip")}</span></div>
    <div class="grid" style="max-height:none"><table><thead><tr><th>${t("deadlines.colDate")}</th><th>${t("deadlines.colWhat")}</th><th>${t("deadlines.colWho")}</th><th class="r">${t("deadlines.colDaysLeft")}</th><th>${t("deadlines.colStatus")}</th></tr></thead><tbody>${TaxEngine.DEADLINES.map((d) => { const days = caDays(d); return `<tr><td class="num">${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td class="cname">${d.label}</td><td>${d.who}</td><td class="r num">${days < 0 ? "–" : days}</td><td>${caDeadlineChip(days)}</td></tr>`; }).join("")}</tbody></table></div>
    <div class="cards" role="list" aria-label="${t("deadlines.title")}">${TaxEngine.DEADLINES.map((d) => { const days = caDays(d); return `<article class="ccard" role="listitem"><div class="h"><b>${d.label}</b>${caDeadlineChip(days)}</div><span class="sub">${d.who}</span><div class="kv"><span><span class="eyebrow">${t("deadlines.colDate")}</span>${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><span><span class="eyebrow">${t("deadlines.colDaysLeft")}</span>${days < 0 ? "–" : days}</span></div></article>`; }).join("")}</div>`, detail: false }; },
  reports() { return { main: `<div class="ph"><h1>${t("reports.title")}</h1></div><section class="cardx"><header><h2>${t("reports.exportsHeader")}</h2><p>${t("reports.exportsSub")}</p></header>
    ${(CA_LOCALE.ca.reports.items || []).map(({ title, help }) => `<div class="row"><div><span class="lbl">${title}</span><p class="help">${help}</p></div><button class="btn ghost" type="button" data-toast="${t("reports.exportToast")}">${ic("down")}${t("reports.exportBtn")}</button></div>`).join("")}</section>
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
    <div class="note-box">${ic("shield")}<span>${t("settings.noteBox")}</span></div>
    ${CA_DISC}`, detail: false };
  },
};

// ---------- render ----------
function caRender() {
  // Keep keyboard focus on the control that was just pressed (issue #11): the view is rebuilt
  // from scratch, so remember which data-* control had focus (and which of its twins) and refocus it.
  let focusSel = "", focusIdx = -1;
  const ae = document.activeElement;
  if (ae && ae.dataset) {
    for (const k of ["room", "bulk", "filt", "sort", "go", "set", "toggle"]) {
      if (ae.dataset[k] !== undefined) { focusSel = `[data-${k}="${ae.dataset[k]}"]` + (k === "set" ? `[data-val="${ae.dataset.val}"]` : ""); focusIdx = [...document.querySelectorAll(focusSel)].indexOf(ae); break; }
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
  if (focusSel && focusIdx >= 0) { const n = document.querySelectorAll(focusSel)[focusIdx]; if (n) n.focus(); }
}
function caGo(v) { caView = v; caRender(); }
function caAct(type, id) {
  const q = Q.find((x) => x.id === id);
  if (!q) return;
  q.state = type;
  AUDIT.push({ c: q.c, type, user: CA_USER, at: Date.now(), reason: type === "approve" ? "" : caReason.trim(), what: q.who, sec: q.sec });
  caReason = "";
  const open = Q.filter((x) => x.state === "open");
  caQSel = open[0] ? open[0].id : undefined;
  syncReviewCounts();
  caToast(type === "approve" ? t("review.approved") : type === "query" ? t("review.querySent") : t("review.rejected"));
  caRender();
}
document.addEventListener("click", (e) => {
  const ev = e.target.closest("[data-evidence]"); if (ev) { caExportEvidencePack(+ev.dataset.evidence); return; }
  const rm = e.target.closest("[data-room]"); if (rm) { caRoom = caRoom === rm.dataset.room ? "" : rm.dataset.room; caRender(); return; }
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
  const t = e.target.closest("[data-toast]"); if (t) { caToast(t.dataset.toast); return; }
  const a = e.target.closest("[data-act]"); if (a && a.dataset.act === "reset") { Object.assign(CS, CA_DEFAULTS); caSave(); caApplyAppearance(); caRender(); caToast(t("common.settingsReset")); }
});
document.getElementById("theme-quick").addEventListener("click", () => { const order = ["auto", "light", "dark"]; caSet("theme", order[(order.indexOf(CS.theme) + 1) % 3]); caToast(t("theme.label", { theme: CS.theme })); });
document.addEventListener("change", (e) => { if (e.target.id === "ca-lowConf") caSet("lowConf", +e.target.value); });
document.addEventListener("input", (e) => { if (e.target && e.target.id === "qreason") caReason = e.target.value; });
document.getElementById("q").addEventListener("input", (e) => { caQuery = e.target.value; if (caView !== "clients") caView = "clients"; caRender(); });
document.addEventListener("keydown", (e) => {
  if (!CS.shortcuts || e.target.closest("input,textarea,select")) return;
  if (e.key === "/") { e.preventDefault(); document.getElementById("q").focus(); return; }
  const list = caView === "queue" ? Q.filter((q) => q.state === "open").map((q) => q.id) : caView === "clients" ? [...document.querySelectorAll(".grid [data-row]")].map((r) => +r.dataset.row) : [];
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
caApplyAppearance();
caRender();

// End-to-end check of terms, interest, bookings, e-mail, newsletter and panel against the
// production build. Starts dist/server/entry.mjs on port 4390 with a throwaway database and
// test settings; e-mails are written to that folder instead of being sent.
// Usage: npm run build && npm run test:e2e
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const repo = new URL("..", import.meta.url).pathname;
const dataDir = mkdtempSync(join(tmpdir(), "mikipierniki-e2e-"));
const PORT = 4390;
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env, HOST: "127.0.0.1", PORT: String(PORT), DATABASE_PATH: join(dataDir, "test.sqlite"),
  PANEL_PASSWORD: "sekret", CRON_TOKEN: "tok", BANK_ACCOUNT: "12 3456 7890 0000 0000 1111 2222",
  BANK_RECIPIENT: "Dominika Testowa", STUDIO_ADDRESS: "ul. Testowa 1, Wrocław",
  // never send real mail from a test, even if the shell has SMTP settings
  SMTP_HOST: "", MAIL_TO_FILES: "1",
};
const server = spawn("node", ["dist/server/entry.mjs"], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && extra ? `  →  ${extra}` : ""}`);
};
const auth = "Basic " + Buffer.from("dominika:sekret").toString("base64");
const get = (p, h = {}) => fetch(BASE + p, { headers: h, redirect: "manual" });
const api = (p, body, h = {}) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", origin: BASE, ...h }, body: JSON.stringify(body) });
const panel = (p, form) => fetch(BASE + p, { method: "POST", headers: { authorization: auth, origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form), redirect: "manual" });
const mails = () => (existsSync(join(dataDir, "mail")) ? readdirSync(join(dataDir, "mail")).filter((f) => f.endsWith(".txt")).sort() : []);
const mail = (f) => readFileSync(join(dataDir, "mail", f), "utf8");
const lastMails = (n) => mails().slice(-n).map(mail);
const db = () => new DatabaseSync(env.DATABASE_PATH);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(400); // flushOutbox runs right after the request

for (let i = 0; i < 100; i++) { try { await fetch(BASE + "/faq"); break; } catch { await sleep(100); } }

try {
  // ---------- public pages, empty database ----------
  let r = await get("/");
  let html = await r.text();
  check("GET / renders on the server", r.status === 200);
  check("home shows empty state when no terms", html.includes("Nowe terminy pojawią się tu wkrótce"));
  r = await get("/warsztaty");
  html = await r.text();
  check("GET /warsztaty", r.status === 200);
  check("/warsztaty has canonical without .html", html.includes('rel="canonical" href="https://mikipierniki.pl/warsztaty"'));
  check("/warsztaty: no Event JSON-LD without open terms", !html.includes('"@type":"Event"'));
  check("static /faq still served", (await get("/faq")).status === 200);
  check("unknown page → 404", (await get("/nie-ma-takiej")).status === 404);

  // ---------- panel auth ----------
  check("/panel without password → 401", (await get("/panel")).status === 401);
  check("/panel wrong password → 401", (await get("/panel", { authorization: "Basic " + Buffer.from("x:zle").toString("base64") })).status === 401);
  r = await get("/panel", { authorization: auth });
  check("/panel with password → 200", r.status === 200);
  check("/panel is noindex", r.headers.get("x-robots-tag")?.includes("noindex"));
  for (const p of ["/panel.html", "/panel/newsletter.html", "/panel/eksport", "/%70anel"]) {
    check(`${p} without password → 401`, (await get(p)).status === 401, String((await get(p)).status));
  }
  r = await get("/panel/");
  check("/panel/ redirects to /panel (which asks for the password)", r.status === 401 || ([301, 308].includes(r.status) && r.headers.get("location")?.endsWith("/panel")), `${r.status} ${r.headers.get("location")}`);
  check("POST /panel.html without password → 401", (await fetch(BASE + "/panel.html", { method: "POST", headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: "title=x" })).status === 401);

  // ---------- creating terms ----------
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
  const create = async (form) => {
    const res = await panel("/panel", { type: "dorosli", title: "Test", start: "11:00", end: "15:00", capacity: "10", price: "450", cookies: "6–8", photo: "swieta-stol", status: "proposed", ...form });
    return { status: res.status, loc: res.headers.get("location") ?? "" };
  };
  let c = await create({ title: "Świąteczne klasyki", date: day(30) });
  check("panel creates proposed term (303)", c.status === 303 && c.loc.startsWith("/panel/termin/t-"), JSON.stringify(c));
  const t1 = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "Zawieszki", date: day(31) });
  const t2 = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "Szkic", date: day(32), status: "draft" });
  const tDraft = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "", date: day(33) });
  check("panel rejects term without title", c.loc.includes("err="), c.loc);
  check("cross-site panel POST → 403", (await fetch(BASE + "/panel", { method: "POST", headers: { authorization: auth, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "title=x" })).status === 403);
  const row = db().prepare("SELECT * FROM terms WHERE id = ?").get(t1);
  check("term stored with Warsaw offset", /T11:00:00\+0[12]:00$/.test(row.starts_at), row.starts_at);

  html = await (await get("/warsztaty")).text();
  check("/warsztaty shows proposed term with 'Pasuje mi'", html.includes(`data-interest="${t1}"`) && html.includes("Propozycja terminu"));
  check("draft term not on the site", !html.includes(tDraft));
  check("proposed term not marked as Event", !html.includes('"@type":"Event"'));
  check("interest dialog rendered", html.includes('id="interest-dialog"'));
  check("no booking dialog without open terms", !html.includes('id="signup-dialog"'));

  // ---------- interest ----------
  check("cross-origin API POST → 403", (await api("/api/zainteresowanie", {}, { origin: "https://evil.example" })).status === 403);
  const before = mails().length;
  r = await api("/api/zainteresowanie", { termIds: [t1, t2], people: 2, name: "Anna Kowalska", email: "Anna@Example.com", phone: "", consent: true });
  check("interest accepted", r.status === 200, await r.clone().text());
  await settle();
  let m = lastMails(2);
  check("two mails after interest (thanks + notify)", mails().length === before + 2);
  check("thanks mail lists both terms and a withdraw link", m.some((x) => x.includes("To: anna@example.com") && x.includes("Świąteczne klasyki") && x.includes("Zawieszki") && x.includes("/zapis/wypisz?t=")));
  check("notify mail goes to warsztaty@ with Reply-To", m.some((x) => x.includes("To: warsztaty@mikipierniki.pl") && x.includes("Reply-To: anna@example.com")));
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 3, name: "Bartek Nowak", email: "bartek@example.com", consent: true });
  check("second interest accepted", r.status === 200);
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 1, name: "Bot", email: "bot@example.com", consent: true, website: "http://spam" });
  check("honeypot rejected", r.status === 400);
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 1, name: "X", email: "nie-email", consent: true });
  check("invalid email rejected with Polish message", r.status === 400 && (await r.json()).error.length > 5);
  r = await api("/api/zainteresowanie", { termIds: [tDraft], people: 1, name: "Ola Test", email: "ola@example.com", consent: true });
  check("interest on draft term rejected", r.status === 409);
  r = await api("/api/rezerwacja", { termId: t1, people: 1, name: "Ola Test", email: "ola@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true });
  check("booking a proposed term rejected", r.status === 409);
  html = await (await get("/panel", { authorization: auth })).text();
  check("panel tally: 5 people interested in t1, group forming", html.includes("5 os.") && html.includes("grupa się zbiera"));

  // ---------- opening a term ----------
  r = await panel(`/panel/termin/${t1}`, { action: "open" });
  check("open term", r.status === 303 && r.headers.get("location").includes("ok="), r.headers.get("location"));
  const beforeNotify = mails().length;
  r = await panel(`/panel/termin/${t1}`, { action: "notify" });
  await settle();
  check("notify interested → 2 mails", mails().length === beforeNotify + 2, `${mails().length - beforeNotify}`);
  check("term-opened mail has booking link", lastMails(2).every((x) => x.includes(`/warsztaty?termin=${t1}`)));
  r = await panel(`/panel/termin/${t1}`, { action: "notify" });
  await settle();
  check("second notify sends nothing", mails().length === beforeNotify + 2);
  html = await (await get("/warsztaty")).text();
  check("open term shows 'Zapisz się' + Event JSON-LD", html.includes(`data-book="${t1}"`) && html.includes('"@type":"Event"'));
  check("street address never on the public page", !html.includes("Testowa 1") && !(await (await get("/")).text()).includes("Testowa 1"));

  // ---------- bookings ----------
  const book = (b) => api("/api/rezerwacja", { termId: t1, name: "Celina Zawada", email: "celina@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true, ...b });
  r = await book({ people: 3 });
  const b1 = await r.json();
  await settle();
  check("booking by transfer → awaiting_payment, total 1350", r.status === 200 && b1.status === "awaiting_payment" && b1.total === 1350, JSON.stringify(b1));
  m = lastMails(2);
  check("transfer mail has account, recipient, ref; no address yet", m.some((x) => x.includes("12 3456 7890") && x.includes("Dominika Testowa") && x.includes(b1.bookingId) && !x.includes("Testowa 1")));
  check("booking notify to Dominika", m.some((x) => x.includes("To: warsztaty@mikipierniki.pl") && x.includes("Rezerwacja (przelew)")));
  r = await book({ people: 1 });
  check("second booking with the same e-mail → 409", r.status === 409 && (await r.json()).error.includes("Masz już rezerwację"));
  r = await book({ people: 8, email: "osiem@example.com" });
  check("too many people → 409 with seats left", r.status === 409 && (await r.json()).error.includes("7"));
  r = await book({ people: 1, email: "dlugie@example.com", notes: "x".repeat(3000) });
  const longErr = (await r.json()).error;
  check("too-long notes → Polish error, not Zod's English", r.status === 400 && longErr.startsWith("Sprawdź"), longErr);
  r = await book({ people: 7, payment: "voucher" });
  check("voucher without code rejected", r.status === 400);
  r = await book({ people: 7, payment: "voucher", voucherCode: "MIKI-2026", email: "dorota@example.com", name: "Dorota Voucher" });
  const b2 = await r.json();
  check("voucher booking → awaiting_payment", b2.status === "awaiting_payment");
  r = await book({ people: 2, email: "ewa@example.com", name: "Ewa Lista" });
  const b3 = await r.json();
  await settle();
  check("full term → waitlist", b3.status === "waitlist");
  check("waitlist mail", lastMails(2).some((x) => x.includes("Lista rezerwowa") && x.includes("ewa@example.com")));
  html = await (await get("/warsztaty")).text();
  check("page shows term as full ('Brak miejsc')", html.includes("Brak miejsc"));

  r = await panel(`/panel/termin/${t1}`, { action: "paid", booking: b1.bookingId });
  await settle();
  check("mark paid → confirmation with address", r.status === 303 && lastMails(1)[0].includes("potwierdzona") && lastMails(1)[0].includes("Testowa 1"));
  r = await panel(`/panel/termin/${t1}`, { action: "admit", booking: b3.bookingId });
  check("admitting from waitlist while full → error", r.headers.get("location").includes("err="));
  r = await panel(`/panel/termin/${t1}`, { action: "cancel-booking", booking: b2.bookingId, notify: "on" });
  await settle();
  check("cancel booking → cancellation mail", lastMails(1)[0].includes("anulowana") && lastMails(1)[0].includes("dorota@example.com"));
  r = await panel(`/panel/termin/${t1}`, { action: "admit", booking: b3.bookingId });
  await settle();
  check("admit from waitlist → transfer mail with 'zwolniło się miejsce'", lastMails(1)[0].includes("zwolniło się miejsce") && lastMails(1)[0].includes("12 3456 7890"));
  const due = db().prepare("SELECT payment_due_at FROM bookings WHERE id = ?").get(b3.bookingId);
  check("admitted booking has a new 3-day deadline", due.payment_due_at && new Date(due.payment_due_at) > new Date(Date.now() + 2.9 * 86400000));

  // concurrent last seats: 5 seats left now (10 - 3 - 2); fire 4 bookings of 2 at once → only 2 may get places
  const racers = await Promise.all([1, 2, 3, 4].map((i) => book({ people: 2, email: `race${i}@example.com`, name: `Race ${i}` }).then((x) => x.json())));
  const won = racers.filter((x) => x.status === "awaiting_payment").length;
  const taken = db().prepare("SELECT SUM(people) n FROM bookings WHERE term_id = ? AND status IN ('awaiting_payment','confirmed')").get(t1).n;
  check("concurrent bookings never overbook", taken <= 10 && won === 2, `won=${won} taken=${taken} ${JSON.stringify(racers)}`);

  // ---------- overdue transfer → one notice to Dominika ----------
  db().prepare("UPDATE bookings SET payment_due_at = ? WHERE id = ?").run(new Date(Date.now() - 3600000).toISOString(), b3.bookingId);
  await get("/api/cron", { "x-cron-token": "tok" });
  await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("overdue transfer → one 'Brak wpłaty' notice", mails().map(mail).filter((x) => x.includes(`Brak wpłaty: ${b3.bookingId}`)).length === 1);

  // ---------- reminders via cron ----------
  c = await create({ title: "Jutro", date: day(1), start: "10:00", end: "12:00" });
  const t3 = c.loc.split("/").pop().split("?")[0];
  // make it start ~20 hours from now regardless of the clock
  const soon = new Date(Date.now() + 20 * 3600000);
  db().prepare("UPDATE terms SET starts_at = ?, ends_at = ? WHERE id = ?").run(soon.toISOString(), new Date(soon.getTime() + 7200000).toISOString(), t3);
  await panel(`/panel/termin/${t3}`, { action: "open" });
  const b4 = await (await api("/api/rezerwacja", { termId: t3, people: 1, name: "Felicja Jutro", email: "felicja@example.com", phone: "500600700", payment: "przelew", acceptedTerms: true })).json();
  await panel(`/panel/termin/${t3}`, { action: "paid", booking: b4.bookingId });
  check("cron without token → 403", (await get("/api/cron")).status === 403);
  r = await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("cron sends day-before reminder", r.status === 200 && mails().map(mail).some((x) => x.includes("felicja@example.com") && x.includes("Do zobaczenia jutro")));
  await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("reminder sent only once", mails().map(mail).filter((x) => x.includes("Do zobaczenia jutro")).length === 1);

  // ---------- newsletter ----------
  r = await api("/api/newsletter", { email: "gosia@example.com" });
  await settle();
  const confirmMail = lastMails(1)[0];
  check("newsletter → confirmation mail", r.status === 200 && confirmMail.includes("/newsletter/potwierdz?t="));
  const ctoken = confirmMail.match(/potwierdz\?t=([\w-]+)/)[1];
  html = await (await get(`/newsletter/potwierdz?t=${ctoken}`)).text();
  check("confirm link activates", html.includes("Gotowe, jesteś na liście") && html.includes('name="robots" content="noindex"'));
  check("confirm with bad token → friendly page", (await (await get("/newsletter/potwierdz?t=zly")).text()).includes("Ten link już nie działa"));
  await api("/api/newsletter", { email: "nie-potwierdzony@example.com" });
  r = await panel("/panel/newsletter", { subject: "Nowe terminy", body: "Cześć,\n\nsą nowe terminy." });
  check("broadcast without confirm checkbox → error", r.headers.get("location").includes("err="));
  const beforeB = mails().length;
  r = await panel("/panel/newsletter", { subject: "Nowe terminy", body: "Cześć,\n\nsą nowe terminy.", confirm: "on" });
  await settle();
  const nl = lastMails(1)[0];
  check("broadcast goes only to confirmed (1 mail)", mails().length === beforeB + 1 && nl.includes("gosia@example.com"), `${mails().length - beforeB}`);
  check("broadcast has List-Unsubscribe headers", nl.includes("List-Unsubscribe") && nl.includes("One-Click"));
  const utoken = nl.match(/wypisz\?t=([\w-]+)/)[1];
  html = await (await get(`/newsletter/wypisz?t=${utoken}`)).text();
  check("unsubscribe GET only asks", html.includes("Tak, wypisz mnie") && db().prepare("SELECT status FROM subscribers WHERE token = ?").get(utoken).status === "active");
  r = await fetch(`${BASE}/newsletter/wypisz?t=${utoken}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  check("one-click unsubscribe without Origin works", r.status === 200 && db().prepare("SELECT status FROM subscribers WHERE token = ?").get(utoken).status === "unsubscribed");

  // ---------- withdrawing interest ----------
  const thanks = mails().map(mail).find((x) => x.includes("To: anna@example.com") && x.includes("/zapis/wypisz?t="));
  const wtoken = thanks.match(/wypisz\?t=([\w-]+)/)[1];
  html = await (await get(`/zapis/wypisz?t=${wtoken}`)).text();
  check("withdraw page lists the terms", html.includes("Wycofać zgłoszenie?"));
  r = await fetch(`${BASE}/zapis/wypisz?t=${wtoken}`, { method: "POST", headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  html = await r.text();
  check("withdraw POST works", html.includes("Zgłoszenie wycofane") && db().prepare("SELECT COUNT(*) n FROM interest WHERE token = ? AND withdrawn_at IS NULL").get(wtoken).n === 0);

  // ---------- cancelling a proposed term ----------
  await api("/api/zainteresowanie", { termIds: [t2], people: 1, name: "Hania Druga", email: "hania@example.com", consent: true });
  await settle();
  const beforeC = mails().length;
  await panel(`/panel/termin/${t2}`, { action: "cancel", notify: "on" });
  await settle();
  check("cancel proposed term → 'nie dojdzie do skutku' only to active interest", mails().length === beforeC + 1 && lastMails(1)[0].includes("hania@example.com") && lastMails(1)[0].includes("nie uda się"));
  check("cancelled term's interest deleted", db().prepare("SELECT COUNT(*) n FROM interest WHERE term_id = ?").get(t2).n === 0);
  check("cancelled term gone from site", !(await (await get("/warsztaty")).text()).includes(`data-interest="${t2}"`));

  // ---------- inquiry ----------
  r = await api("/api/zapytanie", { kind: "zamowienie", name: "Irena Firma", email: "irena@example.com", message: "Poproszę 100 pierników z logo.", details: { okazja: "Firma", liczba_sztuk: "100" } });
  await settle();
  m = lastMails(2);
  check("autoreply quotes nothing the sender typed, asks for photo by reply", m.some((x) => x.includes("To: irena@example.com") && !x.includes("100 pierników") && x.includes("dołącz")));
  r = await api("/api/zapytanie", { kind: "kontakt", name: "http://spam.example", email: "ofiara@example.com", message: "Kliknij http://spam.example" });
  await settle();
  check("autoreply greeting drops a name that isn't a name", lastMails(2).some((x) => x.includes("To: ofiara@example.com") && x.includes("Cześć,") && !x.includes("spam.example")));
  check("inquiry → notify (Reply-To customer) + autoreply", r.status === 200 && m.some((x) => x.includes("To: warsztaty@mikipierniki.pl") && x.includes("Reply-To: irena@example.com") && x.includes("liczba sztuk: 100")) && m.some((x) => x.includes("To: irena@example.com")));

  // ---------- CSV + misc ----------
  r = await get(`/panel/eksport?termin=${t1}`, { authorization: auth });
  const csvBytes = Buffer.from(await r.arrayBuffer());
  check("CSV export (BOM, semicolons, data)", r.status === 200 && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes.toString("utf8").includes("Celina Zawada;"), csvBytes.subarray(0, 80).toString());
  check("CSV export needs password", (await get(`/panel/eksport?termin=${t1}`)).status === 401);
  html = await (await get(`/panel/termin/${t1}`, { authorization: auth })).text();
  check("panel term page renders bookings and interest", html.includes("Celina Zawada") && html.includes("Anna Kowalska") && html.includes("wycofane"));
  const htmlMail = readFileSync(join(dataDir, "mail", mails().find((f) => f.includes("booking-awaiting")).replace(".txt", ".html")), "utf8");
  check("HTML mail escapes user input", !htmlMail.includes("<script"));
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 1, name: "<script>alert(1)</script>", email: "xss@example.com", consent: true });
  check("interest on open term rejected (only proposed)", r.status === 409);
  // ---------- production without SMTP: mail must fail visibly, not pretend to be sent ----------
  const bare = { ...env, PORT: "4392", DATABASE_PATH: join(dataDir, "bare.sqlite"), MAIL_TO_FILES: "" };
  const second = spawn("node", ["dist/server/entry.mjs"], { cwd: repo, env: bare, stdio: "ignore" });
  try {
    for (let i = 0; i < 100; i++) { try { await fetch("http://127.0.0.1:4392/faq"); break; } catch { await sleep(100); } }
    await fetch("http://127.0.0.1:4392/api/newsletter", { method: "POST", headers: { origin: "http://127.0.0.1:4392", "content-type": "application/json" }, body: JSON.stringify({ email: "x@example.com" }) });
    await settle();
    const row = new DatabaseSync(bare.DATABASE_PATH).prepare("SELECT status, last_error FROM outbox").get();
    check("no SMTP in production → mail not marked sent", row && row.status !== "sent" && /SMTP_HOST/.test(row.last_error ?? ""), JSON.stringify(row));
  } finally {
    second.kill();
  }
  check("no server errors logged", !/\[api\]|Error/.test(log), log.slice(0, 500));
} finally {
  server.kill();
  if (!fail) rmSync(dataDir, { recursive: true, force: true });
  else console.log(`database and e-mails kept in ${dataDir}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

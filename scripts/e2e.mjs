// End-to-end check of terms, interest, bookings, e-mail, newsletter and panel against the
// production build. Starts dist/server/entry.mjs on port 4390 (E2E_PORT, plus the next three) with a throwaway database and
// test settings; e-mails are written to that folder instead of being sent.
// Usage: npm run build && npm run test:e2e
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const repo = new URL("..", import.meta.url).pathname;
const dataDir = mkdtempSync(join(tmpdir(), "mikipierniki-e2e-"));
// E2E_PORT lets two runs (e.g. in separate worktrees) go side by side
const PORT = Number(process.env.E2E_PORT) || 4390;
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
const byKind = (kind) => mails().filter((f) => f.endsWith(`-${kind}.txt`)).map(mail);
const sha = (s) => createHash("sha256").update(s).digest("hex");
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
    return { status: res.status, loc: res.headers.get("location") ?? "", html: await res.text() };
  };
  let c = await create({ title: "Świąteczne klasyki", date: day(30) });
  check("panel creates proposed term (303)", c.status === 303 && c.loc.startsWith("/panel/termin/t-"), JSON.stringify(c));
  const t1 = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "Zawieszki", date: day(31) });
  const t2 = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "Szkic", date: day(32), status: "draft" });
  const tDraft = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "", date: day(33) });
  check("panel rejects term without title", c.status === 422 && c.html.includes("Wpisz tytuł"), String(c.status));
  c = await create({ title: "Pierniki od tyłu", date: day(33), start: "15:00", end: "11:00", price: "321", status: "draft" });
  check("rejected new term keeps what was typed", c.status === 422 && c.html.includes("Koniec musi być po początku")
    && c.html.includes('value="Pierniki od tyłu"') && c.html.includes('value="321"') && /value="draft"[^>]*checked/.test(c.html), String(c.status));
  check("cross-site panel POST → 403", (await fetch(BASE + "/panel", { method: "POST", headers: { authorization: auth, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "title=x" })).status === 403);
  r = await panel(`/panel/termin/${t1}`, { action: "save", type: "dorosli", title: "Literówka w tytule", date: day(30), start: "15:00", end: "11:00", capacity: "10", price: "450", cookies: "6–8", photo: "swieta-stol" });
  html = await r.text();
  check("rejected edit keeps what was typed, term unchanged", r.status === 422 && html.includes('value="Literówka w tytule"') && html.includes("Koniec musi być po początku")
    && db().prepare("SELECT title FROM terms WHERE id = ?").get(t1).title === "Świąteczne klasyki", String(r.status));
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
  check("thanks mail says what to do if it wasn't them", m.some((x) => x.includes("To: anna@example.com") && x.includes("Jeśli to nie Ty wypełniałaś(-eś) formularz, kliknij link do wycofania, a wycofam zgłoszenie.")));
  check("interest notify links to the term in the panel", m.some((x) => x.includes("To: mika@mikipierniki.pl") && x.includes(`/panel/termin/${t1}`) && x.includes(`/panel/termin/${t2}`)));
  check("notify mail goes to mika@ with Reply-To", m.some((x) => x.includes("To: mika@mikipierniki.pl") && x.includes("Reply-To: anna@example.com")));
  const annaRow = () => db().prepare("SELECT name, phone, people, token FROM interest WHERE term_id = ? AND email = 'anna@example.com'").get(t1);
  const annaBefore = annaRow();
  const beforeRepeat = mails().length;
  r = await api("/api/zainteresowanie", { termIds: [t1, t2], people: 4, name: "Ktoś Inny", email: "anna@example.com", phone: "999 999 999", consent: true });
  await settle();
  check("repeat sign-up answers the same", r.status === 200);
  check("repeat sign-up doesn't overwrite name, phone, people or token", JSON.stringify(annaRow()) === JSON.stringify(annaBefore), JSON.stringify(annaRow()));
  check("repeat sign-up sends no mail", mails().length === beforeRepeat, `${mails().length - beforeRepeat}`);
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 3, name: "Bartek Nowak", email: "bartek@example.com", phone: "601 234 567", notes: "uczulenie na orzechy", consent: true });
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
  check("term-opened mail names the sender", lastMails(2).every((x) => x.includes("Nadawca: Dominika Saczyńska (Miki Pierniki), ") && /Nadawca: [^\n]*@/.test(x)));
  r = await panel(`/panel/termin/${t1}`, { action: "notify" });
  await settle();
  check("second notify sends nothing", mails().length === beforeNotify + 2);
  html = await (await get("/warsztaty")).text();
  check("open term shows 'Zapisz się' + Event JSON-LD", html.includes(`data-book="${t1}"`) && html.includes('"@type":"Event"'));
  check("street address never on the public page", !html.includes("Testowa 1") && !(await (await get("/")).text()).includes("Testowa 1"));

  // ---------- bookings ----------
  // the payment deadline exactly as the e-mails print it, in Warsaw time
  const dueText = (iso) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: "Europe/Warsaw" });
    const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
    return `${date}, godz. ${time}`;
  };
  const dueOf = (id) => db().prepare("SELECT payment_due_at FROM bookings WHERE id = ?").get(id).payment_due_at;
  const book = (b) => api("/api/rezerwacja", { termId: t1, name: "Celina Zawada", email: "celina@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true, ...b });
  r = await book({ people: 3, notes: "bez orzechów" });
  const b1 = await r.json();
  await settle();
  check("booking by transfer → awaiting_payment, total 1350", r.status === 200 && b1.status === "awaiting_payment" && b1.total === 1350, JSON.stringify(b1));
  m = lastMails(2);
  check("transfer mail has account, recipient, ref and the studio address", m.some((x) => x.includes("12 3456 7890") && x.includes("Dominika Testowa") && x.includes(b1.bookingId) && x.includes("ul. Testowa 1")));
  check("booking notify to Dominika", m.some((x) => x.includes("To: mika@mikipierniki.pl") && x.includes("Rezerwacja (przelew)")));
  check("transfer mail gives the exact payment deadline in Warsaw time", m.some((x) => x.includes(b1.bookingId) && x.includes(`Termin wpłaty: ${dueText(dueOf(b1.bookingId))}.`)), dueText(dueOf(b1.bookingId)));
  check("transfer mail carries organiser, contact, complaints, no-withdrawal, cancellation rule and regulamin link", m.some((x) => x.includes(b1.bookingId)
    && x.includes("Organizatorka: Dominika Saczyńska") && /Kontakt: \S+@\S+, tel\. 880 122 269/.test(x) && /Reklamacje: e-mailem na \S+@\S+, odpowiadam w ciągu 14 dni\./.test(x)
    && x.includes("Prawo odstąpienia od umowy nie przysługuje (art. 38 ust. 1 pkt 12 ustawy o prawach konsumenta).")
    && x.includes("Rezygnacja do 7 dni przed warsztatami: zwrot całej wpłaty albo zmiana terminu. Później zwrot, jeśli miejsce zajmie osoba z listy rezerwowej; możesz też przekazać miejsce innej osobie. Zwrot w ciągu 14 dni.")
    && x.includes("/regulamin")));
  r = await book({ people: 1 });
  check("second booking with the same e-mail → 409", r.status === 409 && (await r.json()).error.includes("Masz już rezerwację"));
  r = await book({ people: 6, email: "szesc@example.com" });
  check("more than 5 people in one booking → 400", r.status === 400 && (await r.json()).error.includes("najwyżej 5"));
  r = await api("/api/zainteresowanie", { termIds: [t2], people: 6, name: "Sześć Osób", email: "szesc@example.com", consent: true });
  check("more than 5 people in one date pick → 400", r.status === 400 && (await r.json()).error.includes("najwyżej 5"));
  r = await book({ people: 1, guardians: 6, email: "opiekunowie@example.com" });
  check("more than 5 guardians → 400", r.status === 400, String(r.status));
  r = await book({ people: 1, email: "dlugie@example.com", notes: "x".repeat(3000) });
  const longErr = (await r.json()).error;
  check("too-long notes → Polish error, not Zod's English", r.status === 400 && longErr.startsWith("Sprawdź"), longErr);
  r = await book({ people: 5, payment: "voucher" });
  check("voucher without code rejected", r.status === 400);
  r = await book({ people: 5, payment: "voucher", voucherCode: "MIKI-2026", email: "dorota@example.com", name: "Dorota Voucher" });
  const b2 = await r.json();
  check("voucher booking → awaiting_payment", b2.status === "awaiting_payment");
  r = await book({ people: 1, payment: "voucher", voucherCode: "zły kod!", email: "kod@example.com" });
  check("voucher code with odd characters rejected", r.status === 400, String(r.status));
  r = await book({ people: 3, email: "trzy@example.com" });
  check("too many people → 409 with seats left", r.status === 409 && (await r.json()).error.includes("zostały 2 miejsca"));
  r = await book({ people: 2, email: "filip@example.com", name: "Filip Dwa" });
  check("last 2 seats booked", (await r.json()).status === "awaiting_payment");
  await settle();
  check("voucher mail carries the information block", byKind("booking-voucher").some((x) => x.includes("Organizatorka: Dominika Saczyńska") && x.includes("Reklamacje: e-mailem na ") && x.includes("/regulamin")));
  check("voucher mail for more than the voucher's value says a top-up follows", byKind("booking-voucher").some((x) => x.includes("Rezerwacja kosztuje 2250 zł, więcej niż voucher (500 zł)")));
  check("owner notification names a voucher payment without the code", byKind("booking-notify").some((x) => x.includes("voucher (kod w panelu)")) && !byKind("booking-notify").some((x) => x.includes("MIKI-2026")));
  r = await book({ people: 2, email: "ewa@example.com", name: "Ewa Lista" });
  const b3 = await r.json();
  await settle();
  check("full term → waitlist", b3.status === "waitlist");
  check("waitlist mail with the information block", lastMails(2).some((x) => x.includes("Lista rezerwowa") && x.includes("ewa@example.com") && x.includes("Organizatorka: Dominika Saczyńska") && x.includes("/regulamin")));
  html = await (await get("/warsztaty")).text();
  check("page shows term as full ('Brak miejsc')", html.includes("Brak miejsc"));

  r = await panel(`/panel/termin/${t1}`, { action: "paid", booking: b1.bookingId });
  await settle();
  check("mark paid → confirmation with address", r.status === 303 && lastMails(1)[0].includes("potwierdzona") && lastMails(1)[0].includes("Testowa 1"));
  check("confirmation mail carries the information block", lastMails(1)[0].includes("Organizatorka: Dominika Saczyńska") && lastMails(1)[0].includes("art. 38 ust. 1 pkt 12") && lastMails(1)[0].includes("/regulamin"));
  r = await panel(`/panel/termin/${t1}`, { action: "admit", booking: b3.bookingId });
  check("admitting from waitlist while full → error", r.headers.get("location").includes("err="));
  r = await panel(`/panel/termin/${t1}`, { action: "cancel-booking", booking: b2.bookingId, notify: "on" });
  await settle();
  check("cancel booking → cancellation mail", lastMails(1)[0].includes("anulowana") && lastMails(1)[0].includes("dorota@example.com"));
  r = await panel(`/panel/termin/${t1}`, { action: "admit", booking: b3.bookingId });
  await settle();
  check("admit from waitlist → transfer mail with 'zwolniło się miejsce'", lastMails(1)[0].includes("zwolniło się miejsce") && lastMails(1)[0].includes("12 3456 7890"));
  check("booking mails to the customer (transfer, seat freed, voucher, waitlist, confirmed) offer a correction on reply", lastMails(1)[0].includes("zwolniło się miejsce")
    && ["booking-awaiting", "booking-voucher", "booking-waitlist", "booking-confirmed"].every((k) => byKind(k).length > 0
      && byKind(k).every((x) => x.includes("Coś się nie zgadza (np. liczba osób albo dane)? Odpisz na tego maila, a poprawię rezerwację."))));
  check("owner notifications don't carry the correction line", byKind("booking-notify").length > 0 && byKind("booking-notify").every((x) => !x.includes("Coś się nie zgadza")));
  const due = db().prepare("SELECT payment_due_at FROM bookings WHERE id = ?").get(b3.bookingId);
  check("admitted booking has a new 3-day deadline", due.payment_due_at && new Date(due.payment_due_at) > new Date(Date.now() + 2.9 * 86400000));

  // concurrent last seats: 3 seats left now (10 - 3 - 2 - 2); fire 4 bookings of 2 at once → only 1 may get a place
  const racers = await Promise.all([1, 2, 3, 4].map((i) => book({ people: 2, email: `race${i}@example.com`, name: `Race ${i}` }).then((x) => x.json())));
  const won = racers.filter((x) => x.status === "awaiting_payment").length;
  const taken = db().prepare("SELECT SUM(people) n FROM bookings WHERE term_id = ? AND status IN ('awaiting_payment','confirmed')").get(t1).n;
  check("concurrent bookings never overbook", taken <= 10 && won === 1, `won=${won} taken=${taken} ${JSON.stringify(racers)}`);

  // ---------- overdue transfer → one notice to Dominika ----------
  db().prepare("UPDATE bookings SET payment_due_at = ? WHERE id = ?").run(new Date(Date.now() - 3600000).toISOString(), b3.bookingId);
  await get("/api/cron", { "x-cron-token": "tok" });
  await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("overdue transfer → one 'Brak wpłaty' notice", mails().map(mail).filter((x) => x.includes(`Brak wpłaty: ${b3.bookingId}`)).length === 1);

  // ---------- reminders via cron ----------
  c = await create({ title: "Jutro", date: day(4), start: "10:00", end: "12:00" });
  const t3 = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${t3}`, { action: "open" });
  const b4 = await (await api("/api/rezerwacja", { termId: t3, people: 1, name: "Felicja Jutro", email: "felicja@example.com", phone: "500600700", payment: "przelew", acceptedTerms: true })).json();
  await panel(`/panel/termin/${t3}`, { action: "paid", booking: b4.bookingId });
  // then make it start ~20 hours from now regardless of the clock
  const setStart = (id, hours) => {
    const at = new Date(Date.now() + hours * 3600000);
    db().prepare("UPDATE terms SET starts_at = ?, ends_at = ? WHERE id = ?").run(at.toISOString(), new Date(at.getTime() + 7200000).toISOString(), id);
  };
  setStart(t3, 20);
  check("cron without token → 403", (await get("/api/cron")).status === 403);
  r = await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("cron sends day-before reminder", r.status === 200 && mails().map(mail).some((x) => x.includes("felicja@example.com") && x.includes("Do zobaczenia jutro")));
  await get("/api/cron", { "x-cron-token": "tok" });
  await settle();
  check("reminder sent only once", mails().map(mail).filter((x) => x.includes("Do zobaczenia jutro")).length === 1);

  // ---------- booking window: closes 48 hours before the start ----------
  c = await create({ title: "Za późno", date: day(4) });
  const t4 = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${t4}`, { action: "open" });
  setStart(t4, 30);
  r = await api("/api/rezerwacja", { termId: t4, people: 1, name: "Grażyna Spóźniona", email: "grazyna@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true });
  const lateErr = await r.json();
  check("booking within 48 h of the start is refused", r.status === 409 && lateErr.error === "Zapisy online na ten termin są już zamknięte. Zadzwoń do mnie, może znajdzie się miejsce.", JSON.stringify(lateErr));
  check("nothing saved for the refused booking", db().prepare("SELECT COUNT(*) n FROM bookings WHERE term_id = ?").get(t4).n === 0);
  c = await create({ title: "Wieczór z ponczem", type: "wieczor", start: "18:00", end: "21:30", date: day(4) });
  const t5 = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${t5}`, { action: "open" });
  setStart(t5, 50);
  r = await api("/api/rezerwacja", { termId: t5, people: 1, name: "Halina Zdążyła", email: "halina@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true });
  const b5 = await r.json();
  await settle();
  check("booking 50 h before the start is accepted", r.status === 200 && b5.status === "awaiting_payment", JSON.stringify(b5));
  const dueRow = db().prepare("SELECT b.payment_due_at due, t.starts_at start FROM bookings b JOIN terms t ON t.id = b.term_id WHERE b.id = ?").get(b5.bookingId);
  check("payment_due_at is no later than start - 24 h (and earlier than booking + 3 days)", new Date(dueRow.due) <= new Date(new Date(dueRow.start).getTime() - 24 * 3600000)
    && new Date(dueRow.due) < new Date(Date.now() + 2.5 * 86400000), JSON.stringify(dueRow));
  check("its mail gives that deadline", byKind("booking-awaiting").some((x) => x.includes(b5.bookingId) && x.includes(`Termin wpłaty: ${dueText(dueOf(b5.bookingId))}.`)), dueText(dueOf(b5.bookingId)));
  html = await (await get("/warsztaty")).text();
  check("closed term: card says so and offers a call, open ones keep the button", html.includes("Zapisy online są już zamknięte") && html.includes('href="tel:+48880122269"') && !html.includes(`data-book="${t4}"`) && html.includes(`data-book="${t5}"`) && html.includes(`data-book="${t1}"`));
  const offered = html.match(/id="signup-terms"[^>]*>(.*?)<\/script>/s)?.[1] ?? "";
  check("booking dialog doesn't offer the closed term", offered.includes(t5) && !offered.includes(t4), offered.slice(0, 200));
  r = await panel(`/panel/termin/${t4}`, { action: "notify" });
  check("no 'your date is open' mail once online booking has closed", r.headers.get("location").includes("err="));

  // ---------- a seat freed less than a day before the start ----------
  c = await create({ title: "Ostatnie miejsce", date: day(4), capacity: "1" });
  const t6 = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${t6}`, { action: "open" });
  const late = (name, email) => api("/api/rezerwacja", { termId: t6, people: 1, name, email, phone: "500 600 700", payment: "przelew", acceptedTerms: true }).then((x) => x.json());
  const lateFirst = await late("Iza Pierwsza", "iza@example.com");
  const lateSecond = await late("Jola Druga", "jola@example.com");
  check("second booking on a one-seat term goes to the waitlist", lateFirst.status === "awaiting_payment" && lateSecond.status === "waitlist");
  await panel(`/panel/termin/${t6}`, { action: "cancel-booking", booking: lateFirst.bookingId });
  setStart(t6, 20);
  await panel(`/panel/termin/${t6}`, { action: "admit", booking: lateSecond.bookingId });
  await settle();
  const lateDue = dueOf(lateSecond.bookingId);
  const t6Start = db().prepare("SELECT starts_at FROM terms WHERE id = ?").get(t6).starts_at;
  check("seat freed 20 h before the start: deadline not passed, not after the start", new Date(lateDue) > new Date(Date.now() + 11 * 3600000) && new Date(lateDue) <= new Date(t6Start), `${lateDue} ${t6Start}`);
  check("its mail gives that deadline", byKind("booking-awaiting").some((x) => x.includes("jola@example.com") && x.includes(`Termin wpłaty: ${dueText(lateDue)}.`)));

  // ---------- children's workshop: a parent stays ----------
  c = await create({ type: "dzieci", title: "Mali lukiernicy", date: day(34), start: "10:00", end: "12:00", price: "200" });
  const t7 = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${t7}`, { action: "open" });
  r = await api("/api/rezerwacja", { termId: t7, people: 2, guardians: 0, name: "Kasia Mama", email: "kasia@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true });
  check("children's booking without a parent → 400", r.status === 400 && (await r.json()).error.includes("co najmniej jeden rodzic"));
  check("nothing saved for it", db().prepare("SELECT COUNT(*) n FROM bookings WHERE term_id = ?").get(t7).n === 0);
  check("evening workshop card has no alcohol", html.includes("Kubek rozgrzewającego ponczu korzennego (bez alkoholu)") && !html.includes("Lampka grzanego wina"));

  // ---------- owner notifications carry no phone numbers or notes ----------
  const ownerMails = [...byKind("booking-notify"), ...byKind("interest-notify")];
  check("owner notifications for bookings and date picks exist", byKind("booking-notify").length >= 3 && byKind("interest-notify").length >= 2);
  check("owner notifications have no phone number or notes", ownerMails.every((x) => !/500 ?600 ?700|601 234 567|uczulenie|bez orzechów|Telefon|Uwagi/.test(x)));
  check("booking notification keeps name, e-mail, count and a panel link", byKind("booking-notify").some((x) => x.includes("Celina Zawada") && x.includes("celina@example.com") && x.includes("(3 os.)") && x.includes(`/panel/termin/${t1}`)));

  // ---------- panel: correcting, deleting and adding bookings ----------
  // own terms and pa- addresses, so the counts in the other sections stay as they are; no state the
  // background tick would act on (confirmed within 30 h of the start, or a transfer past its deadline)
  {
    const pid = (res) => res.loc.split("/").pop().split("?")[0];
    const pA = pid(await create({ title: "Poprawki A", date: day(40), capacity: "6" }));
    const pB = pid(await create({ title: "Poprawki B", type: "wieczor", start: "18:00", end: "21:30", price: "500", date: day(41), capacity: "2" }));
    const pC = pid(await create({ title: "Poprawki C", type: "wieczor", start: "18:00", end: "21:30", price: "500", date: day(43) }));
    const pD = pid(await create({ title: "Poprawki D", date: day(44), capacity: "2" }));
    const pK = pid(await create({ type: "dzieci", title: "Poprawki dzieci", date: day(42), start: "10:00", end: "12:00", price: "200", capacity: "6" }));
    const pL = pid(await create({ title: "Poprawki w 48 h", date: day(5) }));
    for (const t of [pA, pB, pC, pD, pK, pL]) await panel(`/panel/termin/${t}`, { action: "open" });
    setStart(pL, 40);
    const startOf = (t) => new Date(db().prepare("SELECT starts_at FROM terms WHERE id = ?").get(t).starts_at).getTime();
    const flash = (res, k) => new URL(res.headers.get("location") ?? "/", BASE).searchParams.get(k) ?? "";
    const bk = (email) => db().prepare("SELECT * FROM bookings WHERE email = ?").get(email);
    const mailsTo = (email, kind) => mails().filter((f) => !kind || f.endsWith(`-${kind}.txt`)).map(mail).filter((x) => x.startsWith(`To: ${email}\n`));
    const add = (t, form) => panel(`/panel/termin/${t}`, { action: "add-booking", name: "Paula Panel", phone: "500 600 700", people: "1", payment: "przelew", notify: "on", ...form });
    // the "Popraw" form as rendered for booking `b`, with some fields changed
    const edit = (b, form) => panel(`/panel/termin/${b.term_id}`, { action: "edit-booking", booking: b.id, termId: b.term_id, name: b.name, email: b.email, phone: b.phone,
      people: String(b.people), guardians: b.guardians == null ? "" : String(b.guardians), notes: b.notes ?? "", notify: "on", ...form });
    const del = (b, form) => panel(`/panel/termin/${b.term_id}`, { action: "delete-booking", booking: b.id, confirm: "on", ...form });
    const unsent = (kind, to, text, subject = "s", status = "pending") => db().prepare("INSERT INTO outbox (kind, to_addr, subject, text, html, status, send_after, created_at) VALUES (?, ?, ?, ?, 'h', ?, ?, ?)")
      .run(kind, to, subject, text, status, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
    const unsentCount = (text) => db().prepare("SELECT COUNT(*) n FROM outbox WHERE status IN ('pending','failed') AND text = ?").get(text).n;
    const FIX_LINE = "Coś się nie zgadza (np. liczba osób albo dane)? Odpisz na tego maila, a poprawię rezerwację.";

    // adding a booking taken by phone
    let before = mails().length;
    r = await add(pA, { name: "Paulina Przelew", email: "pa-anna@example.com", people: "2", notes: "telefonicznie" });
    await settle();
    let anna = bk("pa-anna@example.com");
    check("panel add → awaiting transfer, total and notes saved", r.status === 303 && flash(r, "ok").includes("dodana i czeka na wpłatę") && anna?.status === "awaiting_payment"
      && anna.total === 900 && anna.payment === "przelew" && anna.notes === "telefonicznie" && anna.paid_at === null, `${flash(r, "err")} ${JSON.stringify(anna)}`);
    check("panel add: deadline no later than the day before", !!anna.payment_due_at && new Date(anna.payment_due_at).getTime() <= startOf(pA) - 24 * 3600000);
    const annaFirst = mailsTo("pa-anna@example.com", "booking-awaiting");
    check("panel add sends the online first mail (transfer data, address, deadline) and nothing to the owner", mails().length === before + 1 && annaFirst.length === 1
      && annaFirst[0].includes("12 3456 7890") && annaFirst[0].includes("ul. Testowa 1") && annaFirst[0].includes(`Termin wpłaty: ${dueText(anna.payment_due_at)}.`)
      && !byKind("booking-notify").some((x) => /\bpa-[\w-]*@example\.com/.test(x)), `${mails().length - before}`);
    r = await add(pA, { email: "PA-Anna@example.com" });
    check("panel add: same address on the same term → error naming the booking", flash(r, "err").includes("ma już rezerwację") && flash(r, "err").includes(anna.id)
      && db().prepare("SELECT COUNT(*) n FROM bookings WHERE email = 'pa-anna@example.com'").get().n === 1, flash(r, "err"));
    r = await add(pA, { email: "pa-szesc@example.com", people: "6" });
    check("panel add: more than 5 people → error", flash(r, "err").includes("najwyżej 5") && !bk("pa-szesc@example.com"), flash(r, "err"));
    r = await add(pA, { email: "pa-piec@example.com", people: "5" });
    check("panel add: more people than seats left → error with seats left", flash(r, "err").includes("zostały 4 miejsca") && !bk("pa-piec@example.com"), flash(r, "err"));
    r = await add(pA, { email: "pa-kod@example.com", payment: "voucher" });
    check("panel add: voucher without a code → error", flash(r, "err").includes("Wpisz numer vouchera") && !bk("pa-kod@example.com"), flash(r, "err"));
    r = await add(pA, { name: "Olga Opłacona", email: "pa-oplacona@example.com", payment: "voucher", voucherCode: "MIKI-PA", paid: "on" });
    await settle();
    let paid = bk("pa-oplacona@example.com");
    check("panel add 'już opłacona' → confirmed with paid_at, confirmation mail with the address", flash(r, "ok").includes("jako opłacona") && paid?.status === "confirmed" && !!paid.paid_at
      && paid.voucher_code === "MIKI-PA" && mailsTo("pa-oplacona@example.com", "booking-confirmed").some((x) => x.includes("voucher się zgadza") && x.includes("ul. Testowa 1")), JSON.stringify(paid));
    before = mails().length;
    r = await add(pA, { name: "Bez Maila", email: "pa-bezmaila@example.com", notify: "" });
    await settle();
    check("panel add without 'wyślij maila' → saved, no mail", bk("pa-bezmaila@example.com")?.status === "awaiting_payment" && mails().length === before, `${mails().length - before}`);
    r = await add(pK, { email: "pa-dziecko@example.com", people: "2", guardians: "0" });
    check("panel add on a children's term without a parent → error", flash(r, "err").includes("co najmniej jeden rodzic") && !bk("pa-dziecko@example.com"), flash(r, "err"));
    r = await add(pK, { email: "pa-dziecko@example.com", people: "2", guardians: "1" });
    let kid = bk("pa-dziecko@example.com");
    check("panel add on a children's term with a parent", kid?.guardians === 1 && kid.total === 400, JSON.stringify(kid));
    r = await api("/api/rezerwacja", { termId: pL, people: 1, name: "Ktoś Online", email: "pa-online@example.com", phone: "500 600 700", payment: "przelew", acceptedTerms: true });
    check("setup: online booking 40 h before the start is refused", r.status === 409);
    r = await add(pL, { email: "pa-pozno@example.com" });
    await settle();
    const late = bk("pa-pozno@example.com");
    check("panel add works inside the last 48 hours, deadline neither passed nor after the start", late?.status === "awaiting_payment" && new Date(late.payment_due_at).getTime() > Date.now() + 11 * 3600000
      && new Date(late.payment_due_at).getTime() <= startOf(pL) && mailsTo("pa-pozno@example.com", "booking-awaiting").some((x) => x.includes(`Termin wpłaty: ${dueText(late.payment_due_at)}.`)), JSON.stringify(late));
    await add(pB, { email: "pa-pelny@example.com", people: "2" });
    r = await add(pB, { name: "Lena Lista", email: "pa-lista@example.com", people: "2" });
    await settle();
    check("panel add on a full term → waitlist and the waitlist mail", flash(r, "ok").includes("na listę rezerwową") && bk("pa-lista@example.com")?.status === "waitlist"
      && mailsTo("pa-lista@example.com", "booking-waitlist").length === 1, flash(r, "ok"));
    r = await add(pB, { email: "pa-lista-oplacona@example.com", paid: "on" });
    check("panel add 'już opłacona' on a full term → error, not a paid waitlist place", flash(r, "err").includes("Termin jest pełny") && !bk("pa-lista-oplacona@example.com"), flash(r, "err"));

    // correcting
    r = await edit(anna, { name: "Paulina Poprawiona", phone: "600 700 800", notes: "" });
    await settle();
    anna = bk("pa-anna@example.com");
    let changed = mailsTo("pa-anna@example.com", "booking-changed");
    check("edit saves name, phone and cleared notes; total unchanged so no amount in the message", flash(r, "ok").includes("poprawiona") && !flash(r, "ok").includes("Kwota")
      && anna.name === "Paulina Poprawiona" && anna.phone === "600 700 800" && anna.notes === null, `${flash(r, "ok")} ${flash(r, "err")}`);
    check("edit with the box → 'booking-changed' mail: details, address, transfer data, deadline, correction line, information block", changed.length === 1
      && changed[0].includes(`Subject: Rezerwacja ${anna.id} poprawiona`) && changed[0].includes("poprawiłam Twoją rezerwację") && changed[0].includes("Kwota: 900 zł")
      && changed[0].includes("ul. Testowa 1") && changed[0].includes("12 3456 7890") && changed[0].includes(`Termin wpłaty: ${dueText(anna.payment_due_at)}.`)
      && changed[0].includes(FIX_LINE) && changed[0].includes("Organizatorka: Dominika Saczyńska") && changed[0].includes("/regulamin"), changed[0]);
    r = await edit(anna, { notes: "bez maila", notify: "" });
    await settle();
    check("edit without the box → saved, no mail", bk("pa-anna@example.com").notes === "bez maila" && mailsTo("pa-anna@example.com", "booking-changed").length === 1);
    const annaDue = bk("pa-anna@example.com").payment_due_at;
    r = await edit(bk("pa-anna@example.com"), { people: "4" });
    anna = bk("pa-anna@example.com");
    check("more people within the free seats → new total, message gives old and new, deadline kept", anna.people === 4 && anna.total === 1800 && anna.payment_due_at === annaDue
      && flash(r, "ok").includes("Kwota zmieniła się z 900 zł na 1800 zł.") && !flash(r, "ok").includes("rozlicz"), flash(r, "ok") || flash(r, "err"));
    r = await edit(anna, { people: "5" });
    check("more people than the free seats (own seats counted as free) → error, unchanged", flash(r, "err").includes("razem z tą rezerwacją: 4") && bk("pa-anna@example.com").people === 4, flash(r, "err"));
    r = await edit(kid, { people: "6" });
    check("edit to more than 5 people → error", flash(r, "err").includes("najwyżej 5") && bk("pa-dziecko@example.com").people === 2, flash(r, "err"));
    r = await edit(anna, { email: "pa-bezmaila@example.com" });
    check("e-mail changed to one already booked on the term → error, unchanged", flash(r, "err").includes("ma już rezerwację") && bk("pa-anna@example.com")?.id === anna.id, flash(r, "err"));

    // a new address: unsent mail to the old one for this booking goes, the rest stays
    unsent("booking-awaiting", "pa-anna@example.com", `pa-stary-1 ${anna.id}`);
    unsent("booking-reminder", "pa-anna@example.com", `pa-stary-2 ${anna.id}`, "s", "failed");
    unsent("booking-awaiting", "pa-anna@example.com", "pa-inna-rezerwacja MP-INNA99");
    unsent("booking-notify", "mika@mikipierniki.pl", `pa-wlascicielka ${anna.id}`);
    r = await edit(anna, { email: "PA-Anna-Nowy@Example.com" });
    await settle();
    check("e-mail change saved in lower case, mail to the new address", bk("pa-anna-nowy@example.com")?.id === anna.id && mailsTo("pa-anna-nowy@example.com", "booking-changed").length === 1, flash(r, "err"));
    check("e-mail change drops pending and failed mail for this booking to the old address", unsentCount(`pa-stary-1 ${anna.id}`) === 0 && unsentCount(`pa-stary-2 ${anna.id}`) === 0);
    check("…but not another booking's mail or the owner's", unsentCount("pa-inna-rezerwacja MP-INNA99") === 1 && unsentCount(`pa-wlascicielka ${anna.id}`) === 1);
    const listSubject = mailsTo("pa-lista@example.com", "booking-waitlist")[0].match(/^Subject: (.*)$/m)[1];
    unsent("booking-waitlist", "pa-lista@example.com", "pa-lista-bez-numeru", listSubject);
    r = await edit(bk("pa-lista@example.com"), { email: "pa-lista-nowa@example.com", notify: "" });
    check("e-mail change drops the unsent waitlist mail too (it carries no booking number)", unsentCount("pa-lista-bez-numeru") === 0 && bk("pa-lista-nowa@example.com")?.status === "waitlist", flash(r, "err"));

    // moving
    const moving = bk("pa-bezmaila@example.com");
    r = await edit(moving, { termId: pB });
    check("move into a full term → error, unchanged", flash(r, "err").includes("zostało 0 miejsc") && bk("pa-bezmaila@example.com").term_id === pA, flash(r, "err"));
    r = await edit(moving, { termId: tDraft });
    check("move to a term without open booking → error", flash(r, "err").includes("Przenieść można tylko") && bk("pa-bezmaila@example.com").term_id === pA, flash(r, "err"));
    anna = bk("pa-anna-nowy@example.com");
    db().prepare("UPDATE bookings SET reminded_at = ?, overdue_notified_at = ? WHERE id = ?").run(new Date().toISOString(), new Date().toISOString(), anna.id);
    r = await edit(anna, { termId: pC });
    await settle();
    anna = bk("pa-anna-nowy@example.com");
    check("move: new term, total at its price, reminder and overdue notice reset", anna.term_id === pC && anna.total === 2000 && anna.reminded_at === null && anna.overdue_notified_at === null
      && flash(r, "ok").includes("przeniesiona na") && flash(r, "ok").includes("Kwota zmieniła się z 1800 zł na 2000 zł."), `${flash(r, "ok")} ${flash(r, "err")} ${JSON.stringify(anna)}`);
    check("move mail names the new date and the new amount", mailsTo("pa-anna-nowy@example.com", "booking-changed").some((x) => x.includes("przeniosłam Twoją rezerwację na") && x.includes("Poprawki C") && x.includes("Kwota: 2000 zł")));
    r = await edit(moving, { termId: pL, notify: "" });
    const moved = bk("pa-bezmaila@example.com");
    check("move to a term 40 h away: deadline recomputed (not 3 days), not after start - 24 h, not passed", moved.term_id === pL && moved.payment_due_at !== moving.payment_due_at
      && new Date(moved.payment_due_at).getTime() <= startOf(pL) - 24 * 3600000 + 1000 && new Date(moved.payment_due_at).getTime() > Date.now() + 11 * 3600000, `${flash(r, "err")} ${JSON.stringify(moved)}`);
    r = await edit(paid, { termId: pC });
    await settle();
    const paidMoved = bk("pa-oplacona@example.com");
    check("paid booking moves, stays paid; message asks to settle the difference", paidMoved.term_id === pC && paidMoved.status === "confirmed" && paidMoved.paid_at === paid.paid_at
      && flash(r, "ok").includes("Kwota zmieniła się z 450 zł na 500 zł: rozlicz dopłatę albo zwrot."), flash(r, "ok") || flash(r, "err"));
    check("its mail says paid and that the difference will be settled", mailsTo("pa-oplacona@example.com", "booking-changed").some((x) => x.includes("Rezerwacja jest opłacona i potwierdzona.")
      && x.includes("Kwota zmieniła się z 450 zł na 500 zł.") && x.includes("ul. Testowa 1") && x.includes(FIX_LINE)));
    await add(pD, { email: "pa-pelny-d@example.com", people: "2" });
    r = await edit(bk("pa-lista-nowa@example.com"), { termId: pD });
    await settle();
    const listMoved = bk("pa-lista-nowa@example.com");
    const listMail = mailsTo("pa-lista-nowa@example.com", "booking-changed");
    check("waitlist booking moves into a full term without a seat check and stays on the waitlist", listMoved.term_id === pD && listMoved.status === "waitlist" && listMoved.total === 900, flash(r, "err"));
    check("waitlist mail: no street address, still the correction line", listMail.length === 1 && listMail[0].includes("listę rezerwową") && !listMail[0].includes("ul. Testowa 1") && listMail[0].includes(FIX_LINE), listMail[0]);
    r = await edit(kid, { termId: pA });
    kid = bk("pa-dziecko@example.com");
    check("move from a children's to an adults' term drops the parents", kid.term_id === pA && kid.guardians === null && kid.total === 900, flash(r, "err"));
    r = await edit(kid, { termId: pK });
    check("move to a children's term without a parent → error", flash(r, "err").includes("co najmniej jeden rodzic") && bk("pa-dziecko@example.com").term_id === pA, flash(r, "err"));
    r = await edit(kid, { termId: pK, guardians: "2" });
    kid = bk("pa-dziecko@example.com");
    check("move to a children's term with parents", kid.term_id === pK && kid.guardians === 2 && kid.total === 400, flash(r, "err"));

    // deleting
    const lateNow = bk("pa-pozno@example.com");
    r = await del(lateNow, { confirm: "" });
    check("delete without the confirmation box → error, kept", flash(r, "err").includes("Zaznacz") && !!bk("pa-pozno@example.com"), flash(r, "err"));
    unsent("booking-awaiting", "pa-pozno@example.com", `pa-usun-1 ${lateNow.id}`);
    unsent("booking-notify", "mika@mikipierniki.pl", `pa-usun-2 ${lateNow.id}`);
    r = await del(lateNow);
    check("delete an unpaid booking → gone, with its unsent mail", flash(r, "ok").includes("usunięta") && !bk("pa-pozno@example.com") && unsentCount(`pa-usun-1 ${lateNow.id}`) === 0 && unsentCount(`pa-usun-2 ${lateNow.id}`) === 0, flash(r, "err"));
    r = await del(paidMoved);
    check("delete a paid booking → refused, kept", flash(r, "err").includes("nie da się usunąć") && !!bk("pa-oplacona@example.com"), flash(r, "err"));
    const pelnyD = bk("pa-pelny-d@example.com");
    await panel(`/panel/termin/${pD}`, { action: "cancel-booking", booking: pelnyD.id });
    r = await del(pelnyD);
    check("delete a cancelled unpaid booking", flash(r, "ok").includes("usunięta") && !bk("pa-pelny-d@example.com"), flash(r, "err"));

    // the page
    html = await (await get(`/panel/termin/${pC}`, { authorization: auth })).text();
    check("panel page: 'Popraw', 'Usuń' for unpaid, a note instead for paid, the add form", html.includes(">Popraw</summary>") && html.includes("wyślij maila z poprawioną rezerwacją")
      && html.includes(">Usuń</summary>") && html.includes("Opłaconej rezerwacji nie usuniesz") && html.includes('value="add-booking"'));
    html = await (await get(`/panel/termin/${tDraft}`, { authorization: auth })).text();
    check("no add form on a term without open booking", !html.includes('value="add-booking"'));
    db().prepare("DELETE FROM outbox WHERE text LIKE 'pa-%'").run();
    await settle();
  }

  // ---------- newsletter ----------
  r = await api("/api/newsletter", { email: "gosia@example.com" });
  await settle();
  const confirmMail = lastMails(1)[0];
  check("newsletter → confirmation mail", r.status === 200 && confirmMail.includes("/newsletter/potwierdz?t="));
  const ctoken = confirmMail.match(/potwierdz\?t=([\w-]+)/)[1];
  check("confirmation mail describes the scope and has no marketing", confirmMail.includes("e-maile o nowych terminach warsztatów i nowościach w ofercie (np. vouchery, pierniki świąteczne)") && !/promocj|rabat|okazj/i.test(confirmMail));
  const nlBefore = mails().length;
  const tokenOf = () => db().prepare("SELECT token FROM subscribers WHERE email = 'gosia@example.com'").get().token;
  await api("/api/newsletter", { email: "Gosia@example.com" });
  await settle();
  check("second sign-up within 24 h sends no second confirmation, token unchanged", mails().length === nlBefore && tokenOf() === ctoken, `${mails().length - nlBefore}`);
  const sub = () => db().prepare("SELECT status FROM subscribers WHERE token = ?").get(ctoken).status;
  const consents = () => db().prepare("SELECT * FROM consent_log WHERE email_hash = ? ORDER BY id").all(sha("gosia@example.com"));
  const confirmPost = (t, origin = BASE) => fetch(`${BASE}/newsletter/potwierdz?t=${t}`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  r = await get(`/newsletter/potwierdz?t=${ctoken}`);
  check("mail-link pages aren't cached and send no referrer", r.headers.get("cache-control") === "no-store" && r.headers.get("referrer-policy") === "no-referrer");
  html = await r.text();
  check("confirm link (GET) only shows the button", html.includes("Potwierdzam zapis") && !html.includes("Gotowe, jesteś na liście") && html.includes('name="robots" content="noindex"'));
  check("GET did not confirm and wrote no consent", sub() === "pending" && consents().length === 0);
  check("cross-site confirm POST → 403", (await confirmPost(ctoken, "https://evil.example")).status === 403 && sub() === "pending");
  r = await confirmPost(ctoken);
  html = await r.text();
  check("confirm POST activates", r.status === 200 && html.includes("Gotowe, jesteś na liście") && sub() === "active");
  const [consent1] = consents();
  check("consent_log row written on confirm", consents().length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(consent1.consent_version) && !!consent1.subscribed_at && !!consent1.confirmed_at && consent1.unsubscribed_at === null, JSON.stringify(consents()));
  check("consent_log holds a hash, not the address", !JSON.stringify(consent1).includes("gosia"));
  await confirmPost(ctoken);
  check("confirming twice writes one consent row", consents().length === 1);
  check("confirm with bad token → friendly page", (await (await get("/newsletter/potwierdz?t=zly")).text()).includes("Ten link już nie działa"));
  await api("/api/newsletter", { email: "nie-potwierdzony@example.com" });
  r = await panel("/panel/newsletter", { subject: "Nowe terminy", body: "Cześć,\n\nsą nowe terminy." });
  check("broadcast without confirm checkbox → error", r.headers.get("location").includes("err="));
  const beforeB = mails().length;
  r = await panel("/panel/newsletter", { subject: "Nowe terminy", body: "Cześć,\n\nsą nowe terminy.", confirm: "on" });
  await settle();
  const nl = lastMails(1)[0];
  check("broadcast goes only to confirmed (1 mail)", mails().length === beforeB + 1 && nl.includes("gosia@example.com"), `${mails().length - beforeB}`);
  check("broadcast names the sender", nl.includes("Nadawca: Dominika Saczyńska (Miki Pierniki), ") && /Nadawca: [^\n]*@/.test(nl));
  check("broadcast has List-Unsubscribe headers", nl.includes("List-Unsubscribe") && nl.includes("One-Click"));
  const utoken = nl.match(/wypisz\?t=([\w-]+)/)[1];
  html = await (await get(`/newsletter/wypisz?t=${utoken}`)).text();
  check("unsubscribe GET only asks", html.includes("Tak, wypisz mnie") && db().prepare("SELECT status FROM subscribers WHERE token = ?").get(utoken).status === "active");
  // mail not yet sent when she unsubscribes is dropped; other kinds stay
  const queue = (kind, to, text = "t", status = "pending") => db().prepare("INSERT INTO outbox (kind, to_addr, subject, text, html, status, send_after, created_at) VALUES (?, ?, 's', ?, 'h', ?, ?, ?)")
    .run(kind, to, text, status, new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
  queue("newsletter", "gosia@example.com");
  queue("newsletter", "gosia@example.com", "t", "failed");
  queue("booking-confirmed", "gosia@example.com");
  const pendingFor = (to) => db().prepare("SELECT kind FROM outbox WHERE status = 'pending' AND to_addr = ?").all(to).map((x) => x.kind);
  r = await fetch(`${BASE}/newsletter/wypisz?t=${utoken}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  check("one-click unsubscribe without Origin works", r.status === 200 && db().prepare("SELECT status FROM subscribers WHERE token = ?").get(utoken).status === "unsubscribed");
  check("unsubscribe sets unsubscribed_at on the consent row", !!consents()[0].unsubscribed_at && consents().length === 1);
  check("unsubscribe drops the unsent newsletter mail only", pendingFor("gosia@example.com").join() === "booking-confirmed", pendingFor("gosia@example.com").join());
  check("unsubscribe drops failed newsletter mail too (so 'retry' can't send it)", db().prepare("SELECT COUNT(*) n FROM outbox WHERE to_addr = 'gosia@example.com' AND kind = 'newsletter' AND status = 'failed'").get().n === 0);
  // signing up again right after unsubscribing sends a fresh link at once, gives a new consent row and keeps the old one
  const oldConsent = consents()[0];
  await api("/api/newsletter", { email: "gosia@example.com" });
  await settle();
  const ctoken2 = tokenOf();
  await confirmPost(ctoken2);
  check("re-subscription adds a consent row and leaves the old one as it was", ctoken2 !== ctoken && consents().length === 2 && JSON.stringify(consents()[0]) === JSON.stringify(oldConsent) && consents()[1].unsubscribed_at === null, JSON.stringify(consents()));
  r = await panel("/panel/newsletter", { action: "remove", email: "Gosia@example.com" });
  const statusOf = (email) => db().prepare("SELECT status FROM subscribers WHERE email = ?").get(email)?.status;
  check("panel 'Wypisz' unsubscribes by address and closes the consent row", r.headers.get("location").includes("ok=") && statusOf("gosia@example.com") === "unsubscribed" && !!consents()[1].unsubscribed_at);
  r = await panel("/panel/newsletter", { action: "remove", email: "nikt@example.com" });
  check("panel 'Wypisz' for an address not on the list → error", r.headers.get("location").includes("err="));

  // ---------- "Powiadom mnie" ticked in the booking and date-pick forms ----------
  // own terms and addresses, so the counts in the other sections stay as they are
  const confirmRows = (email) => db().prepare("SELECT COUNT(*) n FROM outbox WHERE kind = 'newsletter-confirm' AND to_addr = ?").get(email).n;
  const confirmMailTo = (email) => byKind("newsletter-confirm").some((x) => x.includes(`To: ${email}`) && x.includes("/newsletter/potwierdz?t="));
  c = await create({ title: "Lukier i nowości", date: day(36) });
  const tNlPick = c.loc.split("/").pop().split("?")[0];
  c = await create({ title: "Trzy miejsca", date: day(37), capacity: "3" });
  const tNlBook = c.loc.split("/").pop().split("?")[0];
  await panel(`/panel/termin/${tNlBook}`, { action: "open" });
  const pickNl = (email, extra = {}) => api("/api/zainteresowanie", { termIds: [tNlPick], people: 1, name: "Lena Lista", email, consent: true, ...extra });
  const bookNl = (email, extra = {}) => api("/api/rezerwacja", { termId: tNlBook, people: 1, name: "Marta Lista", email, phone: "500 600 700", payment: "przelew", acceptedTerms: true, ...extra });
  // an address already on the list, confirmed the usual way
  await api("/api/newsletter", { email: "aktywna@example.com" });
  await settle();
  await confirmPost(db().prepare("SELECT token FROM subscribers WHERE email = 'aktywna@example.com'").get().token);
  const activeBefore = { token: db().prepare("SELECT token FROM subscribers WHERE email = 'aktywna@example.com'").get().token, confirms: confirmRows("aktywna@example.com"), consents: db().prepare("SELECT COUNT(*) n FROM consent_log WHERE email_hash = ?").get(sha("aktywna@example.com")).n };
  check("setup: aktywna@ is an active subscriber", statusOf("aktywna@example.com") === "active" && activeBefore.confirms === 1 && activeBefore.consents === 1, JSON.stringify(activeBefore));
  const activeUnchanged = () => statusOf("aktywna@example.com") === "active" && confirmRows("aktywna@example.com") === activeBefore.confirms
    && db().prepare("SELECT token FROM subscribers WHERE email = 'aktywna@example.com'").get().token === activeBefore.token
    && db().prepare("SELECT COUNT(*) n FROM consent_log WHERE email_hash = ?").get(sha("aktywna@example.com")).n === activeBefore.consents;

  // date pick ("Pasuje mi")
  r = await pickNl("lena@example.com");
  await settle();
  check("date pick without the box: saved, no subscribers row, no confirmation", r.status === 200 && statusOf("lena@example.com") === undefined && confirmRows("lena@example.com") === 0);
  r = await pickNl("Nina@Example.com", { name: "Nina Nowa", newsletter: true });
  const ninaRes = await r.json();
  await settle();
  check("date pick with the box: same answer, pending subscriber, one 'newsletter-confirm' mail", r.status === 200 && JSON.stringify(ninaRes) === JSON.stringify({ terms: 1 })
    && statusOf("nina@example.com") === "pending" && confirmRows("nina@example.com") === 1 && confirmMailTo("nina@example.com"), `${r.status} ${JSON.stringify(ninaRes)} ${statusOf("nina@example.com")} ${confirmRows("nina@example.com")}`);
  check("date pick with the box: the sign-up itself is saved", !!db().prepare("SELECT 1 FROM interest WHERE term_id = ? AND email = 'nina@example.com'").get(tNlPick));
  r = await pickNl("aktywna@example.com", { newsletter: true });
  await settle();
  check("date pick with the box for an active address: works, no new mail, subscription untouched", r.status === 200 && activeUnchanged());
  r = await pickNl("zly-termin@example.com", { termIds: [tDraft], newsletter: true });
  await settle();
  check("refused date pick (409) with the box: nobody signed up", r.status === 409 && statusOf("zly-termin@example.com") === undefined && confirmRows("zly-termin@example.com") === 0);
  const ninaToken = db().prepare("SELECT token FROM subscribers WHERE email = 'nina@example.com'").get()?.token ?? "brak";
  await confirmPost(ninaToken);
  const ninaConsent = db().prepare("SELECT consent_version, confirmed_at FROM consent_log WHERE email_hash = ?").all(sha("nina@example.com"));
  check("the link from that mail confirms and writes the consent row", statusOf("nina@example.com") === "active" && ninaConsent.length === 1 && ninaConsent[0].consent_version === consent1.consent_version && !!ninaConsent[0].confirmed_at, JSON.stringify(ninaConsent));

  // booking (3 seats)
  r = await bookNl("marta@example.com");
  const martaRes = await r.json();
  await settle();
  check("booking without the box: saved, no subscribers row, no confirmation", r.status === 200 && martaRes.status === "awaiting_payment" && statusOf("marta@example.com") === undefined && confirmRows("marta@example.com") === 0, JSON.stringify(martaRes));
  r = await bookNl("pelna@example.com", { people: 3, newsletter: true });
  const fullErr = await r.json();
  await settle();
  check("booking refused for lack of seats (409) with the box: nobody signed up", r.status === 409 && fullErr.error.includes("zostały 2 miejsca")
    && statusOf("pelna@example.com") === undefined && confirmRows("pelna@example.com") === 0 && !db().prepare("SELECT 1 FROM bookings WHERE email = 'pelna@example.com'").get(), JSON.stringify(fullErr));
  r = await bookNl("marta@example.com", { newsletter: true });
  await settle();
  check("duplicate booking (409) with the box: nobody signed up", r.status === 409 && statusOf("marta@example.com") === undefined && confirmRows("marta@example.com") === 0);
  r = await bookNl("marta@example.com", { newsletter: "tak" });
  check("newsletter that isn't true/false → 400", r.status === 400, String(r.status));
  r = await bookNl("aktywna@example.com", { name: "Ala Aktywna", newsletter: true });
  const activeRes = await r.json();
  await settle();
  check("booking with the box for an active address: works, no new mail, subscription untouched", r.status === 200 && activeRes.status === "awaiting_payment" && activeUnchanged(), JSON.stringify(activeRes));
  r = await bookNl("olga@example.com", { name: "Olga Nowa", newsletter: true });
  const olgaRes = await r.json();
  await settle();
  check("booking with the box: booked, pending subscriber, one 'newsletter-confirm' mail", r.status === 200 && olgaRes.status === "awaiting_payment"
    && statusOf("olga@example.com") === "pending" && confirmRows("olga@example.com") === 1 && confirmMailTo("olga@example.com"), `${JSON.stringify(olgaRes)} ${statusOf("olga@example.com")}`);
  check("booking with the box: the booking's own mail still goes out", byKind("booking-awaiting").some((x) => x.includes(olgaRes.bookingId) && x.includes("To: olga@example.com")));
  r = await bookNl("wanda@example.com", { name: "Wanda Lista", newsletter: true });
  const wandaRes = await r.json();
  await settle();
  check("waitlist booking with the box: on the waitlist, pending subscriber, one 'newsletter-confirm' mail", r.status === 200 && wandaRes.status === "waitlist"
    && statusOf("wanda@example.com") === "pending" && confirmRows("wanda@example.com") === 1 && confirmMailTo("wanda@example.com"), `${JSON.stringify(wandaRes)} ${statusOf("wanda@example.com")}`);

  // ---------- withdrawing interest ----------
  const thanks = mails().map(mail).find((x) => x.includes("To: anna@example.com") && x.includes("/zapis/wypisz?t="));
  const wtoken = thanks.match(/wypisz\?t=([\w-]+)/)[1];
  html = await (await get(`/zapis/wypisz?t=${wtoken}`)).text();
  check("withdraw page lists the terms", html.includes("Wycofać zgłoszenie?"));
  queue("term-opened", "anna@example.com", `Rezerwacja: /zapis/wypisz?t=${wtoken}`);
  queue("term-opened", "anna@example.com", "Rezerwacja: /zapis/wypisz?t=inne-zgloszenie");
  queue("booking-confirmed", "anna@example.com");
  r = await fetch(`${BASE}/zapis/wypisz?t=${wtoken}`, { method: "POST", headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  html = await r.text();
  check("withdraw POST works", html.includes("Zgłoszenie wycofane") && db().prepare("SELECT COUNT(*) n FROM interest WHERE token = ? AND withdrawn_at IS NULL").get(wtoken).n === 0);
  check("withdrawing drops only this sign-up's unsent 'term opened' mail", pendingFor("anna@example.com").join() === "term-opened,booking-confirmed"
    && !!db().prepare("SELECT 1 FROM outbox WHERE status = 'pending' AND to_addr = 'anna@example.com' AND text LIKE '%inne-zgloszenie%'").get(), pendingFor("anna@example.com").join());
  const beforeAgain = mails().length;
  r = await api("/api/zainteresowanie", { termIds: [t2], people: 1, name: "Anna Kowalska", email: "anna@example.com", phone: "500 600 700", consent: true });
  await settle();
  const again = db().prepare("SELECT withdrawn_at, phone FROM interest WHERE term_id = ? AND email = 'anna@example.com'").get(t2);
  check("signing up again after withdrawing doesn't bring the date back", r.status === 200 && !!again.withdrawn_at && again.phone === null && mails().length === beforeAgain, JSON.stringify(again));

  // ---------- panel: correcting, withdrawing and deleting a date pick ----------
  {
    // own terms and pi- addresses; both terms start at the same minute, so the second id is the first plus "-2"
    c = await create({ title: "Poprawki chętnych", date: day(40) });
    const tPi = c.loc.split("/").pop().split("?")[0];
    c = await create({ title: "Ta sama godzina", date: day(40) });
    const tPi2 = c.loc.split("/").pop().split("?")[0];
    check("setup: the second term's id extends the first", tPi2 === `${tPi}-2`, `${tPi} ${tPi2}`);
    const piPick = (termIds, email, extra = {}) => api("/api/zainteresowanie", { termIds, people: 2, name: "Ula Pi", email, phone: "500 600 700", notes: "pi uwagi", consent: true, ...extra });
    await piPick([tPi, tPi2], "pi-ula@example.com");
    await piPick([tPi], "pi-olek@example.com", { name: "Olek Pi", people: 1, phone: "", notes: "" });
    await settle();
    const piRow = (termId, email) => db().prepare("SELECT * FROM interest WHERE term_id = ? AND email = ?").get(termId, email);
    const piPage = async (termId) => (await get(`/panel/termin/${termId}`, { authorization: auth })).text();
    const piAct = (termId, action, row, form = {}) => panel(`/panel/termin/${termId}`, { action, interest: String(row.id), ...form });
    const flash = (res, kind) => new URL(res.headers.get("location") ?? "/", BASE).searchParams.get(kind);
    const ula = piRow(tPi, "pi-ula@example.com"), olek = piRow(tPi, "pi-olek@example.com");
    html = await piPage(tPi);
    check("date-pick rows offer Popraw, Wycofaj and Usuń; tally 2 + 1", html.includes(">3 os.</b>") && html.includes('value="interest-edit"') && html.includes('value="interest-withdraw"') && html.includes('value="interest-delete"'));

    // Popraw
    r = await piAct(tPi, "interest-edit", olek, { name: "Olek Poprawiony", phone: "601 000 111", people: "4", notes: "dwoje dzieci", email: "pi-inny@example.com" });
    const olekEdited = piRow(tPi, "pi-olek@example.com");
    check("Popraw saves name, phone, people and notes, never the e-mail", !!flash(r, "ok") && olekEdited.name === "Olek Poprawiony" && olekEdited.phone === "601 000 111"
      && olekEdited.people === 4 && olekEdited.notes === "dwoje dzieci" && !piRow(tPi, "pi-inny@example.com"), JSON.stringify(olekEdited));
    check("the tally follows the edit (2 + 4)", (await piPage(tPi)).includes(">6 os.</b>"));
    const refused = [];
    for (const people of ["0", "6", "2.5", "x"]) refused.push(await piAct(tPi, "interest-edit", olek, { name: "Olek Poprawiony", people }));
    refused.push(await piAct(tPi, "interest-edit", olek, { name: "Olek Poprawiony", people: "2", phone: "12" }));
    check("Popraw refuses people outside 1..5 and a bad phone; the row stays", refused.every((x) => flash(x, "err")) && flash(refused[1], "err") === "Liczba osób musi być od 1 do 5."
      && flash(refused[4], "err") === "Wpisz poprawny numer telefonu." && JSON.stringify(piRow(tPi, "pi-olek@example.com")) === JSON.stringify(olekEdited), refused.map((x) => flash(x, "err")).join(" | "));
    const ulaOther = piRow(tPi2, "pi-ula@example.com");
    r = await piAct(tPi, "interest-edit", ulaOther, { name: "Ktoś Obcy", people: "1" });
    check("a row of another term can't be changed from this term's page", !!flash(r, "err") && piRow(tPi2, "pi-ula@example.com").name === "Ula Pi");

    // real "your date is open" mails for both terms, put back in the queue to wait (one as failed)
    await panel(`/panel/termin/${tPi}`, { action: "open" });
    await panel(`/panel/termin/${tPi2}`, { action: "open" });
    await panel(`/panel/termin/${tPi}`, { action: "notify" });
    await panel(`/panel/termin/${tPi2}`, { action: "notify" });
    await settle();
    db().prepare("UPDATE outbox SET status = 'pending', send_after = ? WHERE kind = 'term-opened' AND to_addr LIKE 'pi-%'").run(new Date(Date.now() + 7 * 86400000).toISOString());
    db().prepare("UPDATE outbox SET status = 'failed' WHERE kind = 'term-opened' AND to_addr = 'pi-olek@example.com'").run();
    const piQueued = (email) => db().prepare("SELECT text FROM outbox WHERE kind = 'term-opened' AND to_addr = ? AND status IN ('pending','failed')").all(email)
      .map((x) => x.text.match(/\?termin=([\w-]+)/)?.[1]).sort().join();
    check("setup: term-opened mails queued for both of Ula's dates and Olek's", piQueued("pi-ula@example.com") === [tPi, tPi2].sort().join() && piQueued("pi-olek@example.com") === tPi, `${piQueued("pi-ula@example.com")} / ${piQueued("pi-olek@example.com")}`);
    await panel(`/panel/termin/${tPi}`, { action: "propose" }); // collecting date picks again, so the re-sign-up checks below reach registerInterest

    // Wycofaj
    r = await piAct(tPi, "interest-withdraw", ula);
    const ulaWithdrawn = piRow(tPi, "pi-ula@example.com");
    check("Wycofaj keeps the row, marks it withdrawn, clears phone and notes", !!flash(r, "ok") && !!ulaWithdrawn?.withdrawn_at && ulaWithdrawn.phone === null && ulaWithdrawn.notes === null, JSON.stringify(ulaWithdrawn));
    const ulaOtherNow = piRow(tPi2, "pi-ula@example.com");
    check("Wycofaj leaves the same person's other date alone", !ulaOtherNow.withdrawn_at && ulaOtherNow.phone === "500 600 700" && ulaOtherNow.notes === "pi uwagi");
    check("Wycofaj drops this person's queued mail for this date only (same token, the other id extends this one; Olek's stays)", piQueued("pi-ula@example.com") === tPi2
      && piQueued("pi-olek@example.com") === tPi, `${piQueued("pi-ula@example.com")} / ${piQueued("pi-olek@example.com")}`);
    html = await piPage(tPi);
    check("the tally leaves out the withdrawn row (4 people, 1 sign-up)", html.includes(">4 os.</b>") && html.includes("(1 zgłoszenie,"));
    check("a withdrawn row offers only Usuń", (html.match(/value="interest-withdraw"/g) ?? []).length === 1 && (html.match(/value="interest-delete"/g) ?? []).length === 2);
    r = await piAct(tPi, "interest-edit", ula, { name: "Ula Znowu", phone: "500 600 700", people: "2" });
    check("Popraw can't fill a withdrawn row again", !!flash(r, "err") && piRow(tPi, "pi-ula@example.com").phone === null && piRow(tPi, "pi-ula@example.com").name === "Ula Pi");
    const piMails = mails().length;
    r = await piPick([tPi], "pi-ula@example.com", { name: "Ula Znowu" });
    await settle();
    const ulaAgain = piRow(tPi, "pi-ula@example.com");
    check("after Wycofaj, signing up for that date is still blocked", r.status === 200 && !!ulaAgain.withdrawn_at && ulaAgain.name === "Ula Pi" && mails().length === piMails, JSON.stringify(ulaAgain));

    // Usuń
    r = await piAct(tPi, "interest-delete", ula);
    check("Usuń without the tick is refused", !!flash(r, "err") && !!piRow(tPi, "pi-ula@example.com"));
    r = await piAct(tPi, "interest-delete", ula, { confirm: "on" });
    check("Usuń removes the row", !!flash(r, "ok") && !piRow(tPi, "pi-ula@example.com"));
    const ownerPings = () => byKind("interest-notify").filter((x) => x.includes("pi-ula@example.com")).length;
    const pingsBefore = ownerPings();
    r = await piPick([tPi], "pi-ula@example.com", { name: "Ula Od Nowa" });
    await settle();
    const ulaNew = piRow(tPi, "pi-ula@example.com");
    check("after Usuń the address can sign up for that date again", r.status === 200 && ulaNew?.name === "Ula Od Nowa" && !ulaNew.withdrawn_at && ownerPings() === pingsBefore + 1, JSON.stringify(ulaNew));
    r = await piAct(tPi, "interest-delete", olek, { confirm: "on" });
    check("Usuń drops that person's failed mail for this date", !!flash(r, "ok") && !piRow(tPi, "pi-olek@example.com") && piQueued("pi-olek@example.com") === "", piQueued("pi-olek@example.com"));
    const piForm = new URLSearchParams({ action: "interest-delete", interest: String(ulaNew.id), confirm: "on" });
    const noPassword = await fetch(`${BASE}/panel/termin/${tPi}`, { method: "POST", headers: { origin: BASE, "content-type": "application/x-www-form-urlencoded" }, body: piForm, redirect: "manual" });
    const crossSite = await fetch(`${BASE}/panel/termin/${tPi}`, { method: "POST", headers: { authorization: auth, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: piForm, redirect: "manual" });
    check("Usuń without the password → 401, from another site → 403, row kept", noPassword.status === 401 && crossSite.status === 403 && !!piRow(tPi, "pi-ula@example.com"), `${noPassword.status} ${crossSite.status}`);
    await settle();
  }

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
  check("inquiry → notify (Reply-To customer) + autoreply", r.status === 200 && m.some((x) => x.includes("To: mika@mikipierniki.pl") && x.includes("Reply-To: irena@example.com") && x.includes("liczba sztuk: 100")) && m.some((x) => x.includes("To: irena@example.com")));

  const inquiriesFrom = (e) => db().prepare("SELECT COUNT(*) n FROM inquiries WHERE email = ?").get(e).n;
  const beforeSecond = mails().length;
  r = await api("/api/zapytanie", { kind: "kontakt", name: "Irena Firma", email: "Irena@example.com", message: "Jeszcze jedno pytanie." });
  await settle();
  const newOnes = mails().slice(beforeSecond).map(mail);
  check("second inquiry within 24 h: saved, owner notified, no second auto-reply", r.status === 200 && inquiriesFrom("irena@example.com") === 2 && newOnes.length === 1
    && newOnes[0].includes("To: mika@mikipierniki.pl") && newOnes[0].includes("Jeszcze jedno pytanie."), `${newOnes.length}`);
  db().prepare("UPDATE outbox SET created_at = ? WHERE kind = 'inquiry-autoreply' AND to_addr = 'irena@example.com'").run(new Date(Date.now() - 2 * 86400000).toISOString());
  r = await api("/api/zapytanie", { kind: "kontakt", name: "Irena Firma", email: "irena@example.com", message: "A to już po dobie." });
  await settle();
  check("auto-reply works again after 24 h", mails().slice(beforeSecond).map(mail).some((x) => x.includes("To: irena@example.com") && x.includes("Dziękuję za wiadomość")));

  // ---------- CSV + misc ----------
  r = await get(`/panel/eksport?termin=${t1}`, { authorization: auth });
  const csvBytes = Buffer.from(await r.arrayBuffer());
  check("CSV export (BOM, semicolons, data)", r.status === 200 && csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes.toString("utf8").includes("Celina Zawada;"), csvBytes.subarray(0, 80).toString());
  check("CSV export needs password", (await get(`/panel/eksport?termin=${t1}`)).status === 401);
  html = await (await get(`/panel/termin/${t1}`, { authorization: auth })).text();
  check("panel term page renders bookings and interest", html.includes("Celina Zawada") && html.includes("Anna Kowalska") && html.includes("wycofane"));
  const htmlMail = readFileSync(join(dataDir, "mail", mails().find((f) => f.includes("booking-awaiting")).replace(".txt", ".html")), "utf8");
  check("HTML mail escapes user input", !htmlMail.includes("<script"));
  const firstMails = mails().filter((f) => f.includes("booking-awaiting") || f.includes("booking-voucher")).map((f) => readFileSync(join(dataDir, "mail", f), "utf8"));
  check("first booking e-mails (transfer and voucher) carry the studio address", firstMails.length >= 2 && firstMails.every((x) => x.includes("ul. Testowa 1")), firstMails.length);
  r = await api("/api/zainteresowanie", { termIds: [t1], people: 1, name: "<script>alert(1)</script>", email: "xss@example.com", consent: true });
  check("interest on open term rejected (only proposed)", r.status === 409);
  // ---------- production without SMTP: mail must fail visibly, not pretend to be sent ----------
  const barePort = PORT + 2;
  const bare = { ...env, PORT: String(barePort), DATABASE_PATH: join(dataDir, "bare.sqlite"), MAIL_TO_FILES: "" };
  const second = spawn("node", ["dist/server/entry.mjs"], { cwd: repo, env: bare, stdio: "ignore" });
  try {
    for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${barePort}/faq`); break; } catch { await sleep(100); } }
    await fetch(`http://127.0.0.1:${barePort}/api/newsletter`, { method: "POST", headers: { origin: `http://127.0.0.1:${barePort}`, "content-type": "application/json" }, body: JSON.stringify({ email: "x@example.com" }) });
    await settle();
    const row = new DatabaseSync(bare.DATABASE_PATH).prepare("SELECT status, last_error FROM outbox").get();
    check("no SMTP in production → mail not marked sent", row && row.status !== "sent" && /SMTP_HOST/.test(row.last_error ?? ""), JSON.stringify(row));
  } finally {
    second.kill();
  }
  // ---------- retention: clean-up on a database whose dates are moved back ----------
  {
    const port = PORT + 3, base = `http://127.0.0.1:${port}`;
    const rEnv = { ...env, PORT: String(port), DATABASE_PATH: join(dataDir, "retention.sqlite") };
    let rlog = "";
    const start = async () => {
      const p = spawn("node", ["dist/server/entry.mjs"], { cwd: repo, env: rEnv, stdio: ["ignore", "ignore", "pipe"] });
      p.stderr.on("data", (b) => { rlog += b; });
      for (let i = 0; i < 100; i++) { try { await fetch(base + "/warsztaty"); break; } catch { await sleep(100); } }
      return p;
    };
    let p = await start(); // creates the tables
    p.kill();
    await sleep(300);
    const d = new DatabaseSync(rEnv.DATABASE_PATH);
    const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const term = (id, endedDaysAgo) => d.prepare("INSERT INTO terms (id, status, type, title, starts_at, ends_at, price, price_unit, capacity, photo, photo_alt, created_at, updated_at) VALUES (?, 'open', 'dorosli', 'T', ?, ?, 450, 'osoba', 10, 'x', 'x', ?, ?)")
      .run(id, ago(endedDaysAgo + 1), ago(endedDaysAgo), ago(900), ago(900));
    const booking = (id, termId, status, paid) => d.prepare("INSERT INTO bookings (id, term_id, status, name, email, phone, people, payment, total, created_at, paid_at) VALUES (?, ?, ?, 'N', 'n@example.com', '500600700', 1, 'przelew', 450, ?, ?)")
      .run(id, termId, status, ago(900), paid ? ago(899) : null);
    term("old", 31); term("recent", 29); term("y5", 5 * 366); term("y7", 7 * 365);
    // just inside and just outside 6 calendar years (about 2191 days)
    term("y6in", 6 * 365 - 10); term("y6out", 6 * 366 + 10);
    booking("u-old", "old", "awaiting_payment", false); booking("w-old", "old", "waitlist", false); booking("c-old", "old", "cancelled", false); booking("p-old", "old", "confirmed", true);
    booking("u-recent", "recent", "awaiting_payment", false);
    booking("p-5y", "y5", "confirmed", true);
    booking("p-7y", "y7", "confirmed", true); booking("u-7y", "y7", "awaiting_payment", false);
    booking("p-6in", "y6in", "confirmed", true); booking("p-6out", "y6out", "confirmed", true);
    d.prepare("UPDATE bookings SET notes = 'uwagi' WHERE id IN ('p-old', 'u-recent')").run();
    const consent = (hash, unsubDaysAgo) => d.prepare("INSERT INTO consent_log (email_hash, consent_version, subscribed_at, confirmed_at, unsubscribed_at) VALUES (?, '2026-11-21', ?, ?, ?)")
      .run(hash, ago(2000), ago(2000), unsubDaysAgo === null ? null : ago(unsubDaysAgo));
    consent("ended-4y", 4 * 365); consent("ended-2y", 2 * 365); consent("active", null);
    // just inside and just outside 3 years (about 1096 days)
    consent("ended-3y-in", 3 * 365 - 10); consent("ended-3y-out", 3 * 366 + 10);
    // a subscriber confirmed before consent_log existed: rolling the schema back makes the next start add their row
    d.prepare("INSERT INTO subscribers (email, token, status, created_at, confirmed_at) VALUES ('stara@example.com', 'tok-stara', 'active', ?, ?)").run(ago(100), ago(99));
    d.exec("PRAGMA user_version = 3");
    d.close();
    p = await start(); // the first request starts the worker, which cleans up right away
    await sleep(500);
    p.kill();
    const d2 = new DatabaseSync(rEnv.DATABASE_PATH);
    const left = (sql) => d2.prepare(sql).all().map((x) => Object.values(x)[0]).sort().join(",");
    check("clean-up deletes unpaid bookings 30 days after the term, keeps paid ones", left("SELECT id FROM bookings WHERE term_id = 'old'") === "p-old", left("SELECT id FROM bookings WHERE term_id = 'old'"));
    check("clean-up keeps unpaid bookings of a term that ended 29 days ago", left("SELECT id FROM bookings WHERE term_id = 'recent'") === "u-recent");
    check("clean-up keeps paid bookings for 6 years and deletes older ones", left("SELECT id FROM bookings WHERE term_id IN ('y5', 'y6in', 'y6out', 'y7')") === "p-5y,p-6in", left("SELECT id FROM bookings WHERE term_id IN ('y5', 'y6in', 'y6out', 'y7')"));
    check("clean-up clears notes 30 days after the term, not before", left("SELECT id || ':' || COALESCE(notes, '-') FROM bookings WHERE id IN ('p-old', 'u-recent')") === "p-old:-,u-recent:uwagi");
    check("clean-up deletes consent rows 3 years after the consent ended", left("SELECT email_hash FROM consent_log WHERE consent_version = '2026-11-21'") === "active,ended-2y,ended-3y-in", left("SELECT email_hash FROM consent_log"));
    const backfilled = d2.prepare("SELECT * FROM consent_log WHERE consent_version = 'przed-2026-11-21'").all();
    check("subscribers confirmed before consent_log get a row on upgrade", backfilled.length === 1 && backfilled[0].email_hash === sha("stara@example.com") && !!backfilled[0].confirmed_at, JSON.stringify(backfilled));
    check("no errors from the clean-up server", !/Error/.test(rlog), rlog.slice(0, 500));
    d2.close();
  }
  check("no server errors logged", !/\[api\]|Error/.test(log), log.slice(0, 500));
} finally {
  server.kill();
  if (!fail) rmSync(dataDir, { recursive: true, force: true });
  else console.log(`database and e-mails kept in ${dataDir}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

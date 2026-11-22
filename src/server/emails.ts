/**
 * E-mail templates, in Polish and in Dominika's voice like the site.
 * Each returns plain text plus a light HTML version built from the same blocks.
 */
import { plural, pln, shortDate, termDate, timeRange, weekday, workshopTypeLabel } from "@/lib/format";
import { legal, site } from "@/lib/site";
import type { InquiryKind, Term } from "@/lib/types";
import { config } from "./config";
import type { Mail } from "./mail";
import { escapeHtml, warsawParts } from "./util";

/** Dominika's green palette from src/styles/tokens.css (e-mail clients need literal colours) */
const C = {
  sheet: "#E4E7DD", // --sheet
  surface: "#FFFEFA", // --surface
  panel: "#E9EEE3", // between --surface and --panel-deep: the details table
  ink: "#21362D", // --ink
  soft: "#455947", // --ink-soft
  brand: "#3C5948", // --dark
  button: "#3C5948", // --dark, as .btn-primary
  onButton: "#FFFCF4", // --on-dark
};

type Block =
  | { p: string }
  | { list: string[] }
  | { details: [string, string][] }
  | { button: { label: string; url: string } }
  | { small: string };

const SIGNATURE = ["Do zobaczenia,", "Dominika", `${site.name} · mikipierniki.pl · tel. ${site.phone}`];

function render(blocks: Block[], opts: { signature?: boolean } = {}): { text: string; html: string } {
  const sig = opts.signature !== false;
  const text = [
    ...blocks.map((b) =>
      "p" in b ? b.p
      : "list" in b ? b.list.map((x) => `• ${x}`).join("\n")
      : "details" in b ? b.details.map(([k, v]) => `${k}: ${v}`).join("\n")
      : "button" in b ? `${b.button.label}: ${b.button.url}`
      : b.small),
    ...(sig ? [SIGNATURE.join("\n")] : []),
  ].join("\n\n");

  const e = escapeHtml;
  const inner = blocks.map((b) =>
    "p" in b ? `<p style="margin:0 0 16px">${e(b.p).replace(/\n/g, "<br>")}</p>`
    : "list" in b ? `<ul style="margin:0 0 16px;padding-left:20px">${b.list.map((x) => `<li style="margin:0 0 4px">${e(x)}</li>`).join("")}</ul>`
    : "details" in b ? `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;width:100%;background:${C.panel};border-radius:12px">${b.details
        .map(([k, v]) => `<tr><td style="padding:8px 14px;color:${C.soft};vertical-align:top;white-space:nowrap">${e(k)}</td><td style="padding:8px 14px;font-weight:600">${e(v)}</td></tr>`).join("")}</table>`
    : "button" in b ? `<p style="margin:8px 0 24px"><a href="${e(b.button.url)}" style="display:inline-block;background:${C.button};color:${C.onButton};text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">${e(b.button.label)}</a></p>`
    : `<p style="margin:0 0 16px;font-size:13px;color:${C.soft}">${e(b.small).replace(/\n/g, "<br>")}</p>`,
  ).join("");
  const sigHtml = sig
    ? `<p style="margin:24px 0 0">${e(SIGNATURE[0])}<br><strong>${e(SIGNATURE[1])}</strong><br><span style="font-size:13px;color:${C.soft}">${e(SIGNATURE[2])}</span></p>`
    : "";
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${C.sheet};color:${C.ink};font:16px/1.55 -apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font:800 22px Georgia,serif;color:${C.brand}">${e(site.name)}</p>
<div style="background:${C.surface};border-radius:18px;padding:24px">${inner}${sigHtml}</div>
</div></body></html>`;
  return { text, html };
}

/**
 * Greeting with the first name only when it looks like a name. Forms accept any address,
 * so nothing a stranger types (links, long text) may ride along in a mail to someone else.
 */
const firstName = (name: string) => {
  const w = name.trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}'-]{1,30}$/u.test(w) ? w : "";
};
const hi = (name: string): Block => ({ p: firstName(name) ? `Cześć ${firstName(name)},` : "Cześć," });
/** "sobota, 14 listopada, 11:00–15:00": for detail tables and lists */
export const when = (t: Term) => `${weekday(t.startsAt)}, ${termDate(t.startsAt)}, ${timeRange(t)}`;
/** "14 listopada (sobota, 11:00–15:00)": reads right inside a sentence, whatever the case ("na …", "warsztatów …") */
export const whenInText = (t: Term) => `${termDate(t.startsAt)} (${weekday(t.startsAt)}, ${timeRange(t)})`;
const termLine = (t: Term) => `${when(t)} · ${t.title} (${workshopTypeLabel[t.type].toLowerCase()})`;
const url = (path: string) => `${config.siteUrl}${path}`;
const people = (n: number, unit: Term["priceUnit"]) =>
  `${n} ${unit === "dziecko" ? (n === 1 ? "dziecko" : "dzieci") : plural(n, "osoba", "osoby", "osób")}`;

const CANCEL_RULE = "Rezygnacja do 7 dni przed warsztatami: zwrot całej wpłaty albo zmiana terminu. Później zwrot, jeśli miejsce zajmie osoba z listy rezerwowej; możesz też przekazać miejsce innej osobie. Zwrot w ciągu 14 dni.";

/** In every booking mail to the customer, before the information block: a mistake is fixed on reply. */
const CORRECTION_LINE = "Coś się nie zgadza (np. liczba osób albo dane)? Odpisz na tego maila, a poprawię rezerwację.";

/** Who the mail is from; sits in every message that isn't a direct reply to something the reader just did. */
const SENDER_LINE = `Nadawca: ${legal.owner} (${site.name}), ${site.email}`;

/** Seller, contact, complaints, withdrawal and cancellation rules, with the link to the regulamin. */
const bookingInfo = (): Block[] => [
  { p: "Informacje o rezerwacji:" },
  { list: [
    `Organizatorka: ${legal.owner}`,
    ...(legal.business ? [`Firma: ${legal.business}`] : []),
    ...(legal.address ? [`Adres firmy: ${legal.address}`] : []),
    ...(legal.nip ? [`NIP: ${legal.nip}`] : []),
    `Kontakt: ${site.email}, tel. ${site.phone}`,
    `Reklamacje: e-mailem na ${site.email}, odpowiadam w ciągu 14 dni.`,
    "Prawo odstąpienia od umowy nie przysługuje (art. 38 ust. 1 pkt 12 ustawy o prawach konsumenta).",
  ] },
  { small: CANCEL_RULE },
  { small: `Pełny regulamin: ${url("/regulamin")}` },
];

/** "17 listopada, godz. 14:30" */
/** the payment deadline is always days away, so it needs no year */
const dueText = (iso: string) => `${shortDate(iso)}, godz. ${warsawParts(iso).time}`;

/* ---------- interest in proposed dates ---------- */

export function interestThanks(to: string, name: string, terms: Term[], withdrawToken: string): Mail {
  return {
    kind: "interest-thanks", to,
    subject: "Dziękuję! Dam znać, gdy termin się potwierdzi",
    ...render([
      hi(name),
      { p: "dziękuję za zgłoszenie. Zapisałam, że pasują Ci te terminy:" },
      { list: terms.map(termLine) },
      { p: `Gdy na któryś z nich zbierze się grupa (od ${site.groupMin} osób), napiszę do Ciebie z linkiem do rezerwacji. Do tego czasu niczego nie płacisz i nic Cię nie wiąże.` },
      { small: `Plany się zmieniły? Zgłoszenie wycofasz tutaj: ${url(`/zapis/wypisz?t=${withdrawToken}`)}\nJeśli to nie Ty wypełniałaś(-eś) formularz, kliknij link do wycofania, a wycofam zgłoszenie.` },
    ]),
  };
}

export function interestNotify(name: string, email: string, count: number, terms: Term[]): Mail {
  return {
    kind: "interest-notify", to: config.mailNotify, replyTo: email,
    subject: `Nowe zgłoszenie: ${name} (${count} os.)`,
    ...render([
      { p: "Ktoś zgłosił chęć udziału w proponowanych terminach:" },
      { details: [["Imię i nazwisko", name], ["E-mail", email], ["Liczba osób", String(count)]] },
      { list: terms.map(termLine) },
      ...terms.map((t): Block => ({ button: { label: terms.length > 1 ? `Panel: ${termDate(t.startsAt)}` : "Otwórz termin w panelu", url: url(`/panel/termin/${t.id}`) } })),
    ], { signature: false }),
  };
}

export function termOpened(to: string, name: string, t: Term, withdrawToken: string): Mail {
  return {
    kind: "term-opened", to,
    subject: `Termin ${termDate(t.startsAt)} potwierdzony, zapisy otwarte`,
    ...render([
      hi(name),
      { p: "mam dobrą wiadomość: termin, który Ci pasował, odbędzie się." },
      { details: [["Kiedy", when(t)], ["Warsztaty", t.title], ["Cena", `${pln(t.price)} / ${t.priceUnit === "dziecko" ? "dziecko" : "os."}`]] },
      { p: `Miejsc jest ${t.capacity} i o kolejności decydują rezerwacje, więc nie czekaj za długo.` },
      { button: { label: "Przejdź do rezerwacji", url: url(`/warsztaty?termin=${t.id}`) } },
      { small: `Nie chcesz już wiadomości o tym terminie? ${url(`/zapis/wypisz?t=${withdrawToken}`)}` },
      { small: SENDER_LINE },
    ]),
  };
}

export function termDropped(to: string, name: string, t: Term): Mail {
  return {
    kind: "term-dropped", to,
    subject: `Termin ${termDate(t.startsAt)} nie dojdzie do skutku`,
    ...render([
      hi(name),
      { p: `tym razem nie uda się zorganizować warsztatów „${t.title}” ${whenInText(t)}. Twoje zgłoszenie na ten termin usunęłam.` },
      { p: "Inne terminy znajdziesz na stronie. Jeśli żaden Ci nie pasuje, odpisz na tego maila, a dam znać o kolejnych." },
      { button: { label: "Zobacz terminy", url: url("/warsztaty#terminy") } },
    ]),
  };
}

/* ---------- bookings ---------- */

export interface BookingMailData {
  id: string; name: string; email: string; phone: string; people: number; guardians: number | null;
  notes: string | null; payment: "przelew" | "voucher"; voucherCode: string | null; total: number;
  /** When a transfer is due (ISO); only set while a booking awaits payment */
  paymentDueAt?: string | null;
}

const bookingDetails = (b: BookingMailData, t: Term, withAddress: boolean): [string, string][] => [
  ["Numer rezerwacji", b.id],
  ["Kiedy", when(t)],
  ["Warsztaty", t.title],
  ...(withAddress && config.studioAddress ? [["Adres", config.studioAddress] as [string, string]] : []),
  [t.priceUnit === "dziecko" ? "Dzieci" : "Liczba osób", String(b.people)],
  ...(b.guardians ? [["Rodzice na sali", String(b.guardians)] as [string, string]] : []),
  ["Kwota", pln(b.total)],
];

export function bookingAwaitingTransfer(b: BookingMailData, t: Term, intro?: string): Mail {
  return {
    kind: "booking-awaiting", to: b.email,
    subject: `Rezerwacja ${b.id}: dane do przelewu`,
    ...render([
      hi(b.name),
      { p: intro ?? `dziękuję za rezerwację! Miejsce na ${termDate(t.startsAt)} czeka na Ciebie.` },
      { details: bookingDetails(b, t, true) },
      { p: "Dane do przelewu:" },
      { details: [["Odbiorca", config.bankRecipient ?? ""], ["Numer konta", config.bankAccount ?? ""], ["Kwota", pln(b.total)], ["Tytuł", `${b.id} warsztaty ${shortDate(t.startsAt)}`]] },
      { p: `${b.paymentDueAt ? `Termin wpłaty: ${dueText(b.paymentDueAt)}.` : "Na wpłatę masz 3 dni, nie później niż dzień przed warsztatami."} Gdy przelew dotrze, potwierdzę rezerwację mailem.` },
      { small: CORRECTION_LINE },
      ...bookingInfo(),
    ]),
  };
}

export function bookingVoucher(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-voucher", to: b.email,
    subject: `Rezerwacja ${b.id}: sprawdzam voucher`,
    ...render([
      hi(b.name),
      { p: `dziękuję za rezerwację! Sprawdzę kod vouchera ${b.voucherCode ?? ""} i potwierdzę rezerwację mailem, zwykle tego samego dnia.` },
      ...(b.total > site.voucherPrice ? [{ p: `Rezerwacja kosztuje ${pln(b.total)}, więcej niż voucher (${pln(site.voucherPrice)}). W mailu po sprawdzeniu vouchera napiszę, ile i jak dopłacić.` }] : []),
      { details: bookingDetails(b, t, true) },
      { small: CORRECTION_LINE },
      ...bookingInfo(),
    ]),
  };
}

export function bookingWaitlist(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-waitlist", to: b.email,
    subject: `Lista rezerwowa: ${termDate(t.startsAt)}`,
    ...render([
      hi(b.name),
      // the number identifies the entry in replies, and lets the panel drop this mail when the entry changes
      { p: `wszystkie miejsca na ${whenInText(t)} są już zajęte, więc zapisałam Cię na listę rezerwową (${people(b.people, t.priceUnit)}, numer zgłoszenia ${b.id}).` },
      { p: "Gdy zwolni się miejsce, napiszę do Ciebie z danymi do wpłaty. Do tego czasu niczego nie płacisz." },
      { small: CORRECTION_LINE },
      ...bookingInfo(),
    ]),
  };
}

export function bookingConfirmed(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-confirmed", to: b.email,
    subject: `Rezerwacja ${b.id} potwierdzona`,
    ...render([
      hi(b.name),
      { p: b.payment === "voucher" ? "voucher się zgadza, rezerwacja jest potwierdzona!" : "wpłata dotarła, rezerwacja jest potwierdzona!" },
      { details: bookingDetails(b, t, true) },
      { p: "Nie musisz niczego przynosić. Przyjdź w wygodnym ubraniu, wszystkie materiały czekają na miejscu. Dzień przed warsztatami przypomnę się mailem." },
      { small: CORRECTION_LINE },
      ...bookingInfo(),
    ]),
  };
}

export function bookingCancelled(b: BookingMailData, t: Term, why: "term" | "single"): Mail {
  return {
    kind: "booking-cancelled", to: b.email,
    subject: why === "term" ? `Warsztaty ${termDate(t.startsAt)} odwołane` : `Rezerwacja ${b.id} anulowana`,
    ...render([
      hi(b.name),
      why === "term"
        ? { p: `bardzo mi przykro, ale muszę odwołać warsztaty „${t.title}” ${whenInText(t)}. ${b.payment === "voucher"
          ? "Przywrócę kwotę na Twoim voucherze i przedłużę jego ważność o 3 miesiące, a jeśli wolisz, przeniosę Cię na inny termin."
          : "Jeśli wpłata już do mnie dotarła, wybierasz: zwrot całej kwoty w ciągu 14 dni albo inny termin."} Odpisz na tego maila, co wybierasz.` }
        : { p: `anulowałam rezerwację ${b.id} na ${whenInText(t)}. Jeśli to pomyłka albo wpłata jest już w drodze, odpisz na tego maila, a wszystko wyjaśnimy.` },
      { button: { label: "Zobacz inne terminy", url: url("/warsztaty#terminy") } },
    ]),
  };
}

export function bookingReminder(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-reminder", to: b.email,
    subject: `Do zobaczenia jutro! Warsztaty ${termDate(t.startsAt)}`,
    ...render([
      hi(b.name),
      { p: "przypominam, że jutro widzimy się na warsztatach." },
      { details: bookingDetails(b, t, true) },
      { p: `Jeśli coś Ci wypadnie albo się spóźnisz, zadzwoń lub napisz SMS: ${site.phone}.` },
    ]),
  };
}

export function bookingNotify(b: BookingMailData, t: Term, status: string): Mail {
  const label = status === "waitlist" ? "Lista rezerwowa" : b.payment === "voucher" ? "Rezerwacja (voucher)" : "Rezerwacja (przelew)";
  return {
    kind: "booking-notify", to: config.mailNotify, replyTo: b.email,
    subject: `${label}: ${b.name}, ${termDate(t.startsAt)} (${b.people} os.)`,
    ...render([
      { details: [
        ["Numer", b.id], ["Termin", termLine(t)], ["Imię i nazwisko", b.name], ["E-mail", b.email],
        [t.priceUnit === "dziecko" ? "Dzieci" : "Osoby", String(b.people)],
        ...(b.guardians ? [["Rodzice", String(b.guardians)] as [string, string]] : []),
        ["Płatność", b.payment === "voucher" ? "voucher (kod w panelu)" : "przelew"], ["Kwota", pln(b.total)],
      ] },
      { button: { label: "Otwórz w panelu", url: url(`/panel/termin/${t.id}`) } },
    ], { signature: false }),
  };
}

export function bookingOverdue(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-overdue", to: config.mailNotify, replyTo: b.email,
    subject: `Brak wpłaty: ${b.id}, ${b.name}, ${termDate(t.startsAt)}`,
    ...render([
      { p: `Minął termin wpłaty za rezerwację ${b.id} (${b.name}, ${b.people} os., ${pln(b.total)}) na ${whenInText(t)}, a w panelu nie jest oznaczona jako opłacona.` },
      { p: "Jeśli przelew dotarł, kliknij „Opłacone”. Jeśli nie, możesz napisać do tej osoby (odpowiedz na tego maila) albo anulować rezerwację i zwolnić miejsce." },
      { button: { label: "Otwórz w panelu", url: url(`/panel/termin/${t.id}`) } },
    ], { signature: false }),
  };
}

/* ---------- newsletter ---------- */

export function newsletterConfirm(to: string, confirmToken: string): Mail {
  return {
    kind: "newsletter-confirm", to,
    subject: "Potwierdź zapis na wiadomości od Miki Pierniki",
    ...render([
      { p: "Cześć," },
      { p: "dziękuję za zapis! Kliknij przycisk, żeby potwierdzić adres. Potem będę wysyłać Ci e-maile o nowych terminach warsztatów i nowościach w ofercie (np. vouchery, pierniki świąteczne)." },
      { button: { label: "Potwierdzam zapis", url: url(`/newsletter/potwierdz?t=${confirmToken}`) } },
      { small: "Jeśli to nie Ty, zignoruj tę wiadomość. Bez potwierdzenia nie wyślę nic więcej." },
    ]),
  };
}

export function newsletterBroadcast(to: string, subject: string, body: string, unsubscribeToken: string): Mail {
  const unsubscribe = url(`/newsletter/wypisz?t=${unsubscribeToken}`);
  return {
    kind: "newsletter", to, subject,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    ...render([
      ...body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => ({ p })),
      { small: `Dostajesz tę wiadomość, bo zapisałaś(-eś) się na powiadomienia na mikipierniki.pl. Wypisz się jednym kliknięciem: ${unsubscribe}` },
      { small: SENDER_LINE },
    ]),
  };
}

/* ---------- inquiries ---------- */

const inquiryLabel: Record<InquiryKind, string> = {
  zamowienie: "Pierniki na zamówienie",
  "warsztaty-zamkniete": "Warsztaty zamknięte",
  voucher: "Voucher",
  kontakt: "Kontakt",
};

export function inquiryAutoreply(to: string, name: string, kind: InquiryKind): Mail {
  return {
    kind: "inquiry-autoreply", to,
    subject: `Dziękuję za wiadomość (${inquiryLabel[kind].toLowerCase()})`,
    ...render([
      hi(name),
      { p: "dziękuję za wiadomość! Odpisuję zwykle w ciągu 24 godzin (w weekendy i w szczycie sezonu bywa dłużej)." },
      ...(kind === "zamowienie" ? [{ p: "Masz zdjęcie inspiracji albo logo? Odpowiedz na tego maila i dołącz je, na tej podstawie zrobię foremkę." }] : []),
      { small: "Jeśli to nie Ty pisałaś(-eś) przez formularz na mikipierniki.pl, zignoruj tę wiadomość." },
    ]),
  };
}

export function inquiryNotify(kind: InquiryKind, name: string, email: string, phone: string | undefined, message: string, details: Record<string, string>): Mail {
  return {
    kind: "inquiry-notify", to: config.mailNotify, replyTo: email,
    subject: `${inquiryLabel[kind]}: ${name}`,
    ...render([
      { details: [["Imię i nazwisko", name], ["E-mail", email], ["Telefon", phone || "—"], ...Object.entries(details).map(([k, v]) => [k.replace(/_/g, " "), v] as [string, string])] },
      { p: message },
      { small: "Odpowiedz na tego maila, a wiadomość trafi prosto do tej osoby." },
    ], { signature: false }),
  };
}

/* ---------- a booking corrected in the panel ---------- */

/**
 * Dominika corrected or moved a booking: how it stands now and what is left to do. The kind contains no
 * other kind's name, since mail files and checks match kinds by substring.
 */
export function bookingChanged(
  b: BookingMailData, t: Term, status: "awaiting_payment" | "confirmed" | "waitlist",
  opts: { moved?: boolean; previousTotal?: number; offWaitlist?: boolean } = {},
): Mail {
  const waitlist = status === "waitlist";
  const intro = waitlist
    ? (opts.moved ? `przeniosłam Twoje zgłoszenie na listę rezerwową warsztatów ${whenInText(t)}.` : "poprawiłam Twoje zgłoszenie na listę rezerwową.")
    : opts.offWaitlist
    ? `przeniosłam Twoje zgłoszenie z listy rezerwowej na ${whenInText(t)}. Na tym terminie jest dla Ciebie miejsce, więc rezerwacja czeka teraz na wpłatę.`
    : (opts.moved ? `przeniosłam Twoją rezerwację na ${whenInText(t)}.` : "poprawiłam Twoją rezerwację.");
  const totalChanged = opts.previousTotal !== undefined && opts.previousTotal !== b.total;
  const payment: Block[] = waitlist
    ? [{ p: "Jesteś na liście rezerwowej. Gdy zwolni się miejsce, napiszę do Ciebie z danymi do wpłaty. Do tego czasu niczego nie płacisz." }]
    : status === "confirmed"
    ? [{ p: `Rezerwacja jest opłacona i potwierdzona.${totalChanged ? ` Kwota zmieniła się z ${pln(opts.previousTotal!)} na ${pln(b.total)}. Napiszę osobno, jak rozliczymy różnicę.` : ""}` }]
    : b.payment === "voucher"
    ? [
      { p: `Sprawdzę kod vouchera ${b.voucherCode ?? ""} i potwierdzę rezerwację mailem.` },
      ...(b.total > site.voucherPrice ? [{ p: `Rezerwacja kosztuje ${pln(b.total)}, więcej niż voucher (${pln(site.voucherPrice)}). W mailu po sprawdzeniu vouchera napiszę, ile i jak dopłacić.` }] : []),
    ]
    : [
      { p: "Dane do przelewu:" },
      { details: [["Odbiorca", config.bankRecipient ?? ""], ["Numer konta", config.bankAccount ?? ""], ["Kwota", pln(b.total)], ["Tytuł", `${b.id} warsztaty ${shortDate(t.startsAt)}`]] },
      { p: `${b.paymentDueAt ? `Termin wpłaty: ${dueText(b.paymentDueAt)}.` : "Na wpłatę masz 3 dni, nie później niż dzień przed warsztatami."} Gdy przelew dotrze, potwierdzę rezerwację mailem.` },
    ];
  return {
    kind: "booking-changed", to: b.email,
    subject: `Rezerwacja ${b.id} poprawiona`,
    ...render([
      hi(b.name),
      { p: `${intro} Tak wygląda teraz:` },
      // no street address for a waitlist place, as in the waitlist mail
      { details: bookingDetails(b, t, !waitlist) },
      ...payment,
      { small: CORRECTION_LINE },
      ...bookingInfo(),
    ]),
  };
}

/* ---------- database copies (backups.ts, restore.ts) ---------- */

/** Sent to Dominika and, as a separate message, to the administrator. Only the problem's own words: no log line, no customer data. */
export function backupAlert(to: string, problem: { level: "bad" | "warn"; text: string }, alsoSentTo: string): Mail {
  return {
    kind: "backup-alert", to,
    subject: problem.level === "bad" ? "Kopia bazy strony się nie udała" : "Kopia bazy strony: coś wymaga uwagi",
    ...render([
      { p: problem.text },
      { p: `Strona i zapisy działają normalnie; chodzi tylko o nocną kopię zapasową bazy.${alsoSentTo ? ` Ta sama wiadomość poszła też ${alsoSentTo}.` : ""} Gdy kopia znów się uda, czerwony pasek w panelu zniknie. Dopóki problem trwa, ta wiadomość przyjdzie raz na dobę.` },
      { button: { label: "Zobacz kopie w panelu", url: url("/panel/kopie") } },
    ], { signature: false }),
  };
}

/** The one-time link that confirms a restore; goes only to the administrator (MAIL_ADMIN). */
export function restoreLink(to: string, copy: string, link: string, minutes: number): Mail {
  return {
    kind: "restore-link", to,
    subject: "Potwierdź przywrócenie bazy strony",
    ...render([
      { p: `W panelu ktoś poprosił o przywrócenie bazy: ${copy}.` },
      { p: `Link otwiera stronę z podsumowaniem zmian; sama baza zmieni się dopiero po wpisaniu daty kopii i kliknięciu przycisku. Link działa ${minutes} minut i tylko raz.` },
      { button: { label: "Przejdź do potwierdzenia", url: link } },
      { small: "Jeśli ta prośba nie wyszła od Ciebie, zignoruj tę wiadomość: bez potwierdzenia nic się nie zmieni. Warto wtedy zmienić hasło do panelu." },
    ], { signature: false }),
  };
}

/** After a restore, to Dominika and the administrator. */
export function restoreDone(to: string, copy: string, safety: string): Mail {
  return {
    kind: "restore-done", to,
    subject: "Baza strony przywrócona z kopii",
    ...render([
      { p: `Baza strony została przywrócona: ${copy}. Terminy, zapisy i chętni są teraz takie jak w tej kopii.` },
      { p: "Bez zmian zostały: wysłane maile, lista powiadomień (z wypisami), zapytania z formularzy i statystyki. Przypomnienia wysłane po zrobieniu kopii nie pójdą drugi raz, a osoby, które w tym czasie wycofały „Pasuje mi”, nie wrócą na listę. Wróciło za to to, co usunięto po zrobieniu kopii: jeśli ktoś prosił o usunięcie swoich danych, usuń go w panelu jeszcze raz." },
      { p: `Stan sprzed przywrócenia jest zapisany na serwerze (${safety}) i można do niego wrócić z panelu.` },
      { button: { label: "Otwórz panel", url: url("/panel/kopie") } },
    ], { signature: false }),
  };
}

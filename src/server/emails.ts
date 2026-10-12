/**
 * E-mail templates, in Polish and in Dominika's voice like the site.
 * Each returns plain text plus a light HTML version built from the same blocks.
 */
import { plural, pln, shortDate, timeRange, weekday, workshopTypeLabel } from "@/lib/format";
import { site } from "@/lib/site";
import type { InquiryKind, Term } from "@/lib/types";
import { config } from "./config";
import type { Mail } from "./mail";
import { escapeHtml } from "./util";

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
    : "details" in b ? `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;width:100%;background:#FFF2D9;border-radius:12px">${b.details
        .map(([k, v]) => `<tr><td style="padding:8px 14px;color:#764B31;vertical-align:top;white-space:nowrap">${e(k)}</td><td style="padding:8px 14px;font-weight:600">${e(v)}</td></tr>`).join("")}</table>`
    : "button" in b ? `<p style="margin:8px 0 24px"><a href="${e(b.button.url)}" style="display:inline-block;background:#4A2C24;color:#FFFBF1;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">${e(b.button.label)}</a></p>`
    : `<p style="margin:0 0 16px;font-size:13px;color:#764B31">${e(b.small).replace(/\n/g, "<br>")}</p>`,
  ).join("");
  const sigHtml = sig
    ? `<p style="margin:24px 0 0">${e(SIGNATURE[0])}<br><strong>${e(SIGNATURE[1])}</strong><br><span style="font-size:13px;color:#764B31">${e(SIGNATURE[2])}</span></p>`
    : "";
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F6EEDB;color:#36150D;font:16px/1.55 -apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font:800 22px Georgia,serif;color:#500208">${e(site.name)}</p>
<div style="background:#FFFBF1;border-radius:18px;padding:24px">${inner}${sigHtml}</div>
</div></body></html>`;
  return { text, html };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const hi = (name: string): Block => ({ p: `Cześć ${firstName(name)},` });
/** "sobota, 14 listopada, 11:00–15:00" */
export const when = (t: Term) => `${weekday(t.startsAt)}, ${shortDate(t.startsAt)}, ${timeRange(t)}`;
const termLine = (t: Term) => `${when(t)} · ${t.title} (${workshopTypeLabel[t.type].toLowerCase()})`;
const url = (path: string) => `${config.siteUrl}${path}`;
const people = (n: number, unit: Term["priceUnit"]) =>
  `${n} ${unit === "dziecko" ? (n === 1 ? "dziecko" : "dzieci") : plural(n, "osoba", "osoby", "osób")}`;

const CANCEL_RULE = "Jeśli nie możesz przyjść, napisz najpóźniej 7 dni przed terminem: zwrócę całą wpłatę albo przeniosę rezerwację na inny termin. Później możesz przekazać swoje miejsce innej osobie.";

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
      { small: `Plany się zmieniły? Zgłoszenie wycofasz tutaj: ${url(`/zapis/wypisz?t=${withdrawToken}`)}` },
    ]),
  };
}

export function interestNotify(name: string, email: string, phone: string | undefined, count: number, notes: string | undefined, terms: Term[]): Mail {
  return {
    kind: "interest-notify", to: config.mailNotify, replyTo: email,
    subject: `Nowe zgłoszenie: ${name} (${count} os.)`,
    ...render([
      { p: "Ktoś zgłosił chęć udziału w proponowanych terminach:" },
      { details: [["Imię i nazwisko", name], ["E-mail", email], ["Telefon", phone || "—"], ["Liczba osób", String(count)], ["Uwagi", notes || "—"]] },
      { list: terms.map(termLine) },
      { button: { label: "Otwórz panel", url: url("/panel") } },
    ], { signature: false }),
  };
}

export function termOpened(to: string, name: string, t: Term, withdrawToken: string): Mail {
  return {
    kind: "term-opened", to,
    subject: `Termin ${shortDate(t.startsAt)} potwierdzony, zapisy otwarte`,
    ...render([
      hi(name),
      { p: "mam dobrą wiadomość: termin, który Ci pasował, odbędzie się." },
      { details: [["Kiedy", when(t)], ["Warsztaty", t.title], ["Cena", `${pln(t.price)} / ${t.priceUnit === "dziecko" ? "dziecko" : "os."}`]] },
      { p: `Miejsc jest ${t.capacity} i o kolejności decydują rezerwacje, więc nie czekaj za długo.` },
      { button: { label: "Rezerwuję miejsce", url: url(`/warsztaty?termin=${t.id}`) } },
      { small: `Nie chcesz już wiadomości o tym terminie? ${url(`/zapis/wypisz?t=${withdrawToken}`)}` },
    ]),
  };
}

export function termDropped(to: string, name: string, t: Term): Mail {
  return {
    kind: "term-dropped", to,
    subject: `Termin ${shortDate(t.startsAt)} nie dojdzie do skutku`,
    ...render([
      hi(name),
      { p: `tym razem nie uda się zorganizować warsztatów ${when(t)} (${t.title}). Twoje zgłoszenie na ten termin usunęłam.` },
      { p: "Inne terminy znajdziesz na stronie. Jeśli żaden Ci nie pasuje, odpisz na tego maila, a dam znać o kolejnych." },
      { button: { label: "Zobacz terminy", url: url("/warsztaty#terminy") } },
    ]),
  };
}

/* ---------- bookings ---------- */

export interface BookingMailData {
  id: string; name: string; email: string; phone: string; people: number; guardians: number | null;
  notes: string | null; payment: "przelew" | "voucher"; voucherCode: string | null; total: number;
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
      { p: intro ?? `dziękuję za rezerwację! Miejsce na ${shortDate(t.startsAt)} czeka na Ciebie.` },
      { details: bookingDetails(b, t, false) },
      { p: "Dane do przelewu:" },
      { details: [["Odbiorca", config.bankRecipient ?? ""], ["Numer konta", config.bankAccount ?? ""], ["Kwota", pln(b.total)], ["Tytuł", `${b.id} warsztaty ${shortDate(t.startsAt)}`]] },
      { p: "Masz 3 dni na wpłatę. Gdy przelew dotrze, potwierdzę rezerwację mailem i podam adres pracowni." },
      { small: CANCEL_RULE },
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
      { details: bookingDetails(b, t, false) },
      { small: CANCEL_RULE },
    ]),
  };
}

export function bookingWaitlist(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-waitlist", to: b.email,
    subject: `Lista rezerwowa: ${shortDate(t.startsAt)}`,
    ...render([
      hi(b.name),
      { p: `wszystkie miejsca na ${when(t)} są już zajęte, więc zapisałam Cię na listę rezerwową (${people(b.people, t.priceUnit)}).` },
      { p: "Gdy zwolni się miejsce, napiszę do Ciebie z danymi do wpłaty. Do tego czasu niczego nie płacisz." },
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
      { p: "Nie musisz niczego przynosić. Przyjdź w wygodnym ubraniu, fartuch i wszystkie materiały czekają na miejscu. Dzień przed warsztatami przypomnę się mailem." },
      { small: CANCEL_RULE },
    ]),
  };
}

export function bookingCancelled(b: BookingMailData, t: Term, why: "term" | "single"): Mail {
  return {
    kind: "booking-cancelled", to: b.email,
    subject: why === "term" ? `Warsztaty ${shortDate(t.startsAt)} odwołane` : `Rezerwacja ${b.id} anulowana`,
    ...render([
      hi(b.name),
      why === "term"
        ? { p: `bardzo mi przykro, ale muszę odwołać warsztaty ${when(t)} (${t.title}). Jeśli wpłata już do mnie dotarła, zwrócę całą kwotę albo przeniosę Cię na inny termin. Odpisz na tego maila, co wybierasz.` }
        : { p: `anulowałam rezerwację ${b.id} na ${when(t)}. Jeśli to pomyłka albo wpłata jest już w drodze, odpisz na tego maila, a wszystko wyjaśnimy.` },
      { button: { label: "Zobacz inne terminy", url: url("/warsztaty#terminy") } },
    ]),
  };
}

export function bookingReminder(b: BookingMailData, t: Term): Mail {
  return {
    kind: "booking-reminder", to: b.email,
    subject: `Do zobaczenia jutro! Warsztaty ${shortDate(t.startsAt)}`,
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
    subject: `${label}: ${b.name}, ${shortDate(t.startsAt)} (${b.people} os.)`,
    ...render([
      { details: [
        ["Numer", b.id], ["Termin", termLine(t)], ["Imię i nazwisko", b.name], ["E-mail", b.email], ["Telefon", b.phone],
        [t.priceUnit === "dziecko" ? "Dzieci" : "Osoby", String(b.people)],
        ...(b.guardians ? [["Rodzice", String(b.guardians)] as [string, string]] : []),
        ["Płatność", b.payment === "voucher" ? `voucher ${b.voucherCode ?? ""}` : "przelew"], ["Kwota", pln(b.total)], ["Uwagi", b.notes || "—"],
      ] },
      { button: { label: "Otwórz w panelu", url: url(`/panel/termin/${t.id}`) } },
    ], { signature: false }),
  };
}

/* ---------- newsletter ---------- */

export function newsletterConfirm(to: string, confirmToken: string): Mail {
  return {
    kind: "newsletter-confirm", to,
    subject: "Potwierdź zapis na wiadomości o terminach",
    ...render([
      { p: "Cześć," },
      { p: "dziękuję za zapis! Kliknij przycisk, żeby potwierdzić adres. Potem napiszę, gdy tylko pojawią się nowe terminy warsztatów." },
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

export function inquiryAutoreply(to: string, name: string, kind: InquiryKind, message: string): Mail {
  return {
    kind: "inquiry-autoreply", to,
    subject: `Dziękuję za wiadomość (${inquiryLabel[kind].toLowerCase()})`,
    ...render([
      hi(name),
      { p: "dziękuję za wiadomość! Odpiszę najpóźniej w ciągu 24 godzin, zwykle tego samego dnia." },
      { small: `Twoja wiadomość:\n${message}` },
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

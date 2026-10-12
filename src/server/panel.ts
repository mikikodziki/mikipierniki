/** Actions behind the /panel forms. */
import { termPhotos } from "@/lib/api";
import { workshopDefaults } from "@/lib/site";
import type { TermStatus, WorkshopType } from "@/lib/types";
import { bookingsForTerm, cancelAllForTerm } from "./bookings";
import { bookingBlockers } from "./config";
import { getDb, tx } from "./db";
import { termDropped } from "./emails";
import { UserError } from "./http";
import { interestForTerm } from "./interest";
import { enqueue } from "./mail";
import { getTerm, setTermStatus, type TermInput } from "./terms";
import { warsawIso } from "./util";

const TYPES: WorkshopType[] = ["dorosli", "wieczor", "dzieci"];

export const statusLabel: Record<TermStatus, string> = { draft: "Szkic", proposed: "Propozycja", open: "Zapisy otwarte", cancelled: "Odwołany" };

/** Reads the add/edit term form. Times are Warsaw local time. */
export function termFromForm(f: FormData): TermInput {
  const get = (k: string) => String(f.get(k) ?? "").trim();
  const type = get("type") as WorkshopType;
  if (!TYPES.includes(type)) throw new UserError("Wybierz rodzaj warsztatów.");
  const title = get("title");
  if (title.length < 3) throw new UserError("Wpisz tytuł warsztatów.");
  const date = get("date");
  const start = get("start");
  const end = get("end");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    throw new UserError("Podaj datę oraz godzinę początku i końca.");
  }
  if (end <= start) throw new UserError("Koniec musi być po początku.");
  const capacity = Number(get("capacity"));
  const price = Number(get("price"));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) throw new UserError("Liczba miejsc musi być od 1 do 30.");
  if (!Number.isInteger(price) || price < 0 || price > 5000) throw new UserError("Podaj cenę w pełnych złotych.");
  const photo = termPhotos().find((p) => p.photo === get("photo")) ?? termPhotos()[0];
  return {
    type, title, startsAt: warsawIso(date, start), endsAt: warsawIso(date, end), price,
    priceUnit: type === "dzieci" ? "dziecko" : "osoba", capacity,
    cookies: get("cookies") || workshopDefaults[type].cookies, photo: photo.photo, photoAlt: photo.alt,
  };
}

/** Status changes allowed from each status, as offered in the panel. */
export function changeStatus(id: string, to: TermStatus): void {
  const t = getTerm(id);
  if (!t) throw new UserError("Nie ma takiego terminu.", 404);
  const active = bookingsForTerm(id).some((b) => b.status !== "cancelled");
  if (to === "open") {
    const missing = bookingBlockers();
    if (missing.length) throw new UserError(`Zanim otworzysz zapisy, uzupełnij na serwerze: ${missing.join(", ")}.`);
    if (t.status !== "draft" && t.status !== "proposed") throw new UserError("Zapisy można otworzyć tylko dla szkicu albo propozycji.");
  } else if (to === "proposed") {
    if (t.status === "cancelled" || active) throw new UserError("Ten termin ma już rezerwacje albo jest odwołany.");
  } else if (to === "draft") {
    if (t.status !== "proposed" || interestForTerm(id).length) throw new UserError("Do szkicu można cofnąć tylko propozycję bez zgłoszeń.");
  } else {
    throw new UserError("Do odwołania służy osobny przycisk.");
  }
  setTermStatus(id, to);
}

/** Cancels a term; optionally tells everyone who booked or said the date suits them. */
export function cancelTerm(id: string, notify: boolean): { bookings: number; interest: number } {
  const t = getTerm(id);
  if (!t) throw new UserError("Nie ma takiego terminu.", 404);
  if (t.status === "cancelled") return { bookings: 0, interest: 0 };
  const db = getDb();
  return tx(db, () => {
    setTermStatus(id, "cancelled");
    // interest in a date that won't happen has no purpose left, and the e-mail says it was deleted
    const dropInterest = () => db.prepare("DELETE FROM interest WHERE term_id = ?").run(id);
    if (!notify) {
      db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE term_id = ? AND status != 'cancelled'").run(new Date().toISOString(), id);
      dropInterest();
      return { bookings: 0, interest: 0 };
    }
    const booked = new Set(bookingsForTerm(id).filter((b) => b.status !== "cancelled").map((b) => b.email));
    const bookings = cancelAllForTerm(id, t);
    // people who booked already get the cancellation; the rest of the interested get "won't happen"
    const interest = interestForTerm(id).filter((r) => !r.withdrawn_at && !booked.has(r.email));
    for (const r of interest) enqueue(termDropped(r.email, r.name, t));
    dropInterest();
    return { bookings, interest: interest.length };
  });
}

/** CSV for a spreadsheet; semicolons and a BOM so Excel in Polish opens it straight away. */
export function csv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** Redirect after a POST, carrying a one-line message for the next page. */
export function back(path: string, msg: { ok?: string; err?: string }): Response {
  const u = new URL(path, "http://x");
  if (msg.ok) u.searchParams.set("ok", msg.ok);
  if (msg.err) u.searchParams.set("err", msg.err);
  return new Response(null, { status: 303, headers: { location: u.pathname + u.search + u.hash } });
}

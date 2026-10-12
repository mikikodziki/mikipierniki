import type { APIRoute } from "astro";
import { bookingsForTerm } from "@/server/bookings";
import { interestForTerm } from "@/server/interest";
import { subscribers } from "@/server/newsletter";
import { csv } from "@/server/panel";
import { getTerm } from "@/server/terms";

export const prerender = false;

/** CSV downloads: ?termin=<id> (bookings + interest) or ?co=newsletter. Behind the panel password (middleware). */
export const GET: APIRoute = ({ url }) => {
  const file = (name: string, body: string) =>
    new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });

  if (url.searchParams.get("co") === "newsletter") {
    const rows = subscribers().map((s) => [s.email, s.status, s.created_at, s.confirmed_at, s.unsubscribed_at]);
    return file("powiadomienia.csv", csv([["email", "status", "zapis", "potwierdzenie", "wypisanie"], ...rows]));
  }

  const id = url.searchParams.get("termin") ?? "";
  const term = getTerm(id);
  if (!term) return new Response("Nie ma takiego terminu.", { status: 404 });
  const rows = [
    ["rodzaj", "numer", "imię i nazwisko", "email", "telefon", "osoby", "rodzice", "status", "płatność", "kwota", "uwagi", "data zgłoszenia"],
    ...bookingsForTerm(id).map((b) => ["rezerwacja", b.id, b.name, b.email, b.phone, b.people, b.guardians, b.status, b.payment, b.total, b.notes, b.created_at]),
    ...interestForTerm(id).map((r) => ["chętny", "", r.name, r.email, r.phone, r.people, "", r.withdrawn_at ? "wycofane" : r.notified_at ? "link wysłany" : "czeka", "", "", r.notes, r.created_at]),
  ];
  return file(`${id}.csv`, csv(rows));
};

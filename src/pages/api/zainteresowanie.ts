import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fields, handleJson } from "@/server/http";
import { registerInterest } from "@/server/interest";
import { flushOutbox } from "@/server/mail";
import { subscribeAfterSignup } from "@/server/newsletter";
import { site } from "@/lib/site";

export const prerender = false;

const schema = z.object({
  termIds: z.array(z.string().max(60)).min(1, "Zaznacz co najmniej jeden termin.").max(20),
  people: z.number().int().min(1, "Dodaj co najmniej jedną osobę.").max(site.bookingMax, `Na jedno zgłoszenie mogę przyjąć najwyżej ${site.bookingMax} osób. Większą grupę zapraszam na warsztaty zamknięte.`),
  name: fields.name,
  email: fields.email,
  phone: fields.phone.optional().or(z.literal("")),
  notes: fields.notes,
  consent: z.literal(true, "Zaznacz prośbę o kontakt, żebym mogła dać Ci znać."),
  newsletter: z.boolean().default(false),
});

export const POST: APIRoute = ({ request }) =>
  handleJson(request, schema, (d) => {
    // throws (409) before anything is saved; a repeat sign-up answers like a new one, and so does this
    const res = registerInterest({ ...d, phone: d.phone || undefined });
    if (d.newsletter) subscribeAfterSignup(d.email);
    void flushOutbox();
    return res;
  });

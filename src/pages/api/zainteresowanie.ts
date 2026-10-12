import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fields, handleJson } from "@/server/http";
import { registerInterest } from "@/server/interest";
import { flushOutbox } from "@/server/mail";

export const prerender = false;

const schema = z.object({
  termIds: z.array(z.string().max(60)).min(1, "Zaznacz co najmniej jeden termin.").max(20),
  people: z.number().int().min(1, "Dodaj co najmniej jedną osobę.").max(10, "Na jeden termin mogę przyjąć najwyżej 10 osób."),
  name: fields.name,
  email: fields.email,
  phone: fields.phone.optional().or(z.literal("")),
  notes: fields.notes,
  consent: z.literal(true, "Zaznacz zgodę na kontakt, żebym mogła dać Ci znać."),
});

export const POST: APIRoute = ({ request }) =>
  handleJson(request, schema, (d) => {
    const res = registerInterest({ ...d, phone: d.phone || undefined });
    void flushOutbox();
    return res;
  });

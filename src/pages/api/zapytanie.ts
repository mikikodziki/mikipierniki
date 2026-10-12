import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fields, handleJson } from "@/server/http";
import { saveInquiry } from "@/server/inquiries";
import { flushOutbox } from "@/server/mail";

export const prerender = false;

const schema = z.object({
  kind: z.enum(["zamowienie", "warsztaty-zamkniete", "voucher", "kontakt"]),
  name: fields.name,
  email: fields.email,
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(2, "Napisz kilka słów wiadomości.").max(5000),
  details: z.record(z.string().max(40), z.string().max(500)).optional(),
});

export const POST: APIRoute = ({ request }) =>
  handleJson(request, schema, (d) => {
    saveInquiry(d);
    void flushOutbox();
    return { ok: true };
  });

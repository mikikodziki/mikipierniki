import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createBooking } from "@/server/bookings";
import { fields, handleJson } from "@/server/http";
import { flushOutbox } from "@/server/mail";
import { site } from "@/lib/site";

export const prerender = false;

const VOUCHER_CODE = /^[A-Za-z0-9-]{3,40}$/;

const schema = z
  .object({
    termId: z.string().max(60),
    people: z.number().int().min(1, "Dodaj co najmniej jedną osobę.").max(site.bookingMax, `Na jedną rezerwację mogę przyjąć najwyżej ${site.bookingMax} osób. Większą grupę zapraszam na warsztaty zamknięte.`),
    guardians: z.number().int().min(0).max(site.bookingMax).optional(),
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    notes: fields.notes,
    payment: z.enum(["przelew", "voucher"]),
    // empty is left to the check below, which asks for a number
    voucherCode: z.string().trim().refine((v) => v === "" || VOUCHER_CODE.test(v), "Numer vouchera to litery, cyfry i myślniki (3–40 znaków).").optional(),
    acceptedTerms: z.literal(true, "Zaznacz akceptację regulaminu, żeby zarezerwować miejsce."),
  })
  .refine((d) => d.payment !== "voucher" || !!d.voucherCode, "Wpisz numer vouchera albo wybierz przelew.");

export const POST: APIRoute = ({ request }) =>
  handleJson(request, schema, (d) => {
    const res = createBooking(d);
    void flushOutbox();
    return res;
  });

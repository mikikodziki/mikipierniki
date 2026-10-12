import { z } from "astro/zod";

/** An error whose message is safe to show the visitor (Polish, actionable). */
export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const MAX_BODY = 20_000;

/**
 * Reads a JSON body, drops bots that filled the hidden "website" field, validates with `schema`
 * and runs `fn`. UserErrors become `{ error }` responses; anything else is logged and hidden.
 */
export async function handleJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  fn: (data: z.infer<S>) => unknown | Promise<unknown>,
): Promise<Response> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) throw new UserError("Wiadomość jest za długa.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new UserError("Nieprawidłowe dane formularza.");
    }
    if (body && typeof body === "object" && "website" in body && (body as { website: unknown }).website) {
      throw new UserError("Nie udało się wysłać formularza.");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UserError(first?.message && !first.message.startsWith("Invalid") ? first.message : "Sprawdź pola formularza i spróbuj ponownie.");
    }
    return json(await fn(parsed.data));
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error("[api]", e);
    return json({ error: "Coś poszło nie tak po mojej stronie. Spróbuj ponownie za chwilę albo napisz na e-mail." }, 500);
  }
}

/* shared field rules; messages are what the visitor sees */
export const fields = {
  name: z.string().trim().min(2, "Wpisz imię i nazwisko.").max(120),
  email: z.string().trim().max(200).pipe(z.email("Wpisz poprawny adres e-mail.")),
  phone: z.string().trim().regex(/^[0-9 +()\-]{9,20}$/, "Wpisz poprawny numer telefonu."),
  notes: z.string().trim().max(2000).optional(),
};

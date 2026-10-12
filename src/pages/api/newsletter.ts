import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fields, handleJson } from "@/server/http";
import { flushOutbox } from "@/server/mail";
import { subscribe } from "@/server/newsletter";

export const prerender = false;

const schema = z.object({ email: fields.email });

export const POST: APIRoute = ({ request }) =>
  handleJson(request, schema, (d) => {
    subscribe(d.email);
    void flushOutbox();
    return { ok: true };
  });

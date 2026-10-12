import type { APIRoute } from "astro";
import { config } from "@/server/config";
import { json } from "@/server/http";
import { tick } from "@/server/tick";

export const prerender = false;

/** Called every few minutes by a systemd timer on the VPS: `curl -H "x-cron-token: …" …/api/cron`. */
export const GET: APIRoute = async ({ request }) => {
  if (!config.cronToken || request.headers.get("x-cron-token") !== config.cronToken) return json({ error: "forbidden" }, 403);
  await tick();
  return json({ ok: true });
};

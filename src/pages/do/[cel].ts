/**
 * Outbound links that go through our address, so the statistics can count them without a script
 * (deploy/start.mjs sees the request; src/server/stats.ts counts it under its path). A fixed list,
 * no address taken from the request, and no identifier in the link.
 */
import type { APIRoute } from "astro";
import { outbound } from "@/lib/outbound";

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  // own keys only: "constructor" or "toString" must not resolve to something inherited
  const to = params.cel && Object.hasOwn(outbound, params.cel) ? outbound[params.cel as keyof typeof outbound] : undefined;
  if (!to) return new Response("Nie ma takiego linku.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(null, {
    status: 302,
    headers: { location: to, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" },
  });
};

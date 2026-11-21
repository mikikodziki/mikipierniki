/**
 * Links that leave the site. Pages link to /do/<name> instead, which counts the click and
 * redirects here (src/pages/do/[cel].ts); structured data (JSON-LD sameAs) keeps the direct address.
 */
import { venues } from "./mock-data";
import { site } from "./site";

const studio = venues[0];
// Pin the municipal address point: Google resolves the text "55J" to number 55.
const destination = studio?.coordinates ? `${studio.coordinates.lat},${studio.coordinates.lng}` : studio ? `${studio.address}, ${studio.city}` : "";
/** Google Maps query for the studio, shared by the embedded map on /kontakt and the outbound link */
export const studioMapQuery = encodeURIComponent(destination);

export const outbound = {
  instagram: site.instagram,
  mapa: `https://www.google.com/maps/search/?api=1&query=${studioMapQuery}`,
} as const;

/** Our counted address for an outbound link */
export const out = (name: keyof typeof outbound) => `/do/${name}`;

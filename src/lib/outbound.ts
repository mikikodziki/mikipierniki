/**
 * Links that leave the site. Pages link to /do/<name> instead, which counts the click and
 * redirects here (src/pages/do/[cel].ts); structured data (JSON-LD sameAs) keeps the direct address.
 */
import { venueById } from "./api";
import { site } from "./site";

const studio = venueById("pracownia");
/** Where the studio is, as the site may say it: district and city only, never the street */
export const studioPlace = [studio.district, studio.city].filter(Boolean).join(", ");
/** Google Maps query for the studio's district, shared by the embedded map on /kontakt and the outbound link */
export const studioMapQuery = encodeURIComponent(studioPlace);

export const outbound = {
  instagram: site.instagram,
  mapa: `https://www.google.com/maps/search/?api=1&query=${studioMapQuery}`,
} as const;

/** Our counted address for an outbound link */
export const out = (name: keyof typeof outbound) => `/do/${name}`;

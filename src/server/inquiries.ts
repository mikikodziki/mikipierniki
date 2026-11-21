/** Inquiries from the order, private-workshop, voucher and contact forms. */
import type { InquiryRequest } from "@/lib/types";
import { getDb, nowIso } from "./db";
import { inquiryAutoreply, inquiryNotify } from "./emails";
import { enqueue, underHourlyCap } from "./mail";
import { normalizeEmail } from "./util";

const AUTOREPLY_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function saveInquiry(req: InquiryRequest): void {
  const db = getDb();
  const email = normalizeEmail(req.email);
  const details = req.details ?? {};
  db.prepare("INSERT INTO inquiries (kind, name, email, phone, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(req.kind, req.name, email, req.phone ?? null, req.message, JSON.stringify(details), nowIso());
  const notify = inquiryNotify(req.kind, req.name, email, req.phone, req.message, details);
  // the auto-reply goes out once per address per day; the inquiry is always saved and the owner always notified
  const replied = db.prepare("SELECT 1 FROM outbox WHERE kind = 'inquiry-autoreply' AND to_addr = ? AND created_at > ?")
    .get(email, new Date(Date.now() - AUTOREPLY_INTERVAL_MS).toISOString());
  enqueue(...(replied || !underHourlyCap("inquiry-autoreply") ? [notify] : [notify, inquiryAutoreply(email, req.name, req.kind)]));
}

export interface InquiryRow {
  id: number; kind: string; name: string; email: string; phone: string | null; message: string; details: string; created_at: string;
  hidden_at: string | null;
}

export const INQUIRY_FILTERS = ["aktywne", "ukryte", "wszystkie"] as const;
export type InquiryFilter = (typeof INQUIRY_FILTERS)[number];

const FILTER_SQL: Record<InquiryFilter, string> = {
  aktywne: "WHERE hidden_at IS NULL",
  ukryte: "WHERE hidden_at IS NOT NULL",
  wszystkie: "",
};

export function inquiries(filter: InquiryFilter = "aktywne", limit = 200): InquiryRow[] {
  return getDb().prepare(`SELECT * FROM inquiries ${FILTER_SQL[filter]} ORDER BY id DESC LIMIT ?`).all(limit) as unknown as InquiryRow[];
}

export function inquiryCounts(): Record<InquiryFilter, number> {
  const r = getDb().prepare("SELECT COUNT(*) AS n, COUNT(hidden_at) AS hidden FROM inquiries").get() as { n: number; hidden: number };
  return { aktywne: r.n - r.hidden, ukryte: r.hidden, wszystkie: r.n };
}

/** Hides an inquiry from the default list, or brings it back. False when there is no such inquiry. */
export function setInquiryHidden(id: number, hidden: boolean): boolean {
  return getDb().prepare("UPDATE inquiries SET hidden_at = ? WHERE id = ?").run(hidden ? nowIso() : null, id).changes > 0;
}

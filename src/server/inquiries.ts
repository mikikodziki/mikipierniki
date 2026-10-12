/** Inquiries from the order, private-workshop, voucher and contact forms. */
import type { InquiryRequest } from "@/lib/types";
import { getDb, nowIso } from "./db";
import { inquiryAutoreply, inquiryNotify } from "./emails";
import { enqueue } from "./mail";
import { normalizeEmail } from "./util";

export function saveInquiry(req: InquiryRequest): void {
  const email = normalizeEmail(req.email);
  const details = req.details ?? {};
  getDb().prepare("INSERT INTO inquiries (kind, name, email, phone, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(req.kind, req.name, email, req.phone ?? null, req.message, JSON.stringify(details), nowIso());
  enqueue(inquiryNotify(req.kind, req.name, email, req.phone, req.message, details), inquiryAutoreply(email, req.name, req.kind, req.message));
}

export interface InquiryRow {
  id: number; kind: string; name: string; email: string; phone: string | null; message: string; details: string; created_at: string;
}

export function inquiries(limit = 200): InquiryRow[] {
  return getDb().prepare("SELECT * FROM inquiries ORDER BY id DESC LIMIT ?").all(limit) as unknown as InquiryRow[];
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DOMAIN } from "../lib/resend";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ status: "ok", domain: DOMAIN, resendConfigured: !!process.env.RESEND_API_KEY, defaultFrom: process.env.RESEND_FROM_EMAIL || "", timestamp: new Date().toISOString() });
}

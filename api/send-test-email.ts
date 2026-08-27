import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatchResendEmail } from "../lib/resend";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { to } = req.body || {};
    const targetEmail = to || process.env.RESEND_TEST_EMAIL;
    if (!targetEmail) return res.status(400).json({ error: "A recipient email is required." });
    const result = await dispatchResendEmail({
      to: targetEmail, subject: "Premier Lighting - Email Delivery Test",
      html: `<div style="font-family:sans-serif;padding:24px;max-width:500px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px"><h2 style="color:#1e3a8a">Email System Operational</h2><p>This is a test notification confirming that Resend email delivery is configured.</p><p><strong>Recipient:</strong> ${targetEmail}</p><p><strong>Timestamp:</strong> ${new Date().toISOString()}</p></div>`,
    });
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    console.error("Error sending test email:", error);
    return res.status(500).json({ success: false, emailSent: false, error: error?.message || "Failed to send test email" });
  }
}

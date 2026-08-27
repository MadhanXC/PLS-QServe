import { Resend } from "resend";

const DOMAIN = process.env.RESEND_EMAIL_DOMAIN || "";
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "";
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function dispatchResendEmail(params: {
  to: string; subject: string; html: string; accountOwnerEmail?: string;
}): Promise<{ success: boolean; id?: string; emailSent: boolean; warning?: string; sender: string }> {
  const resend = getResend();
  const cleanTo = (params.to || "").trim().toLowerCase();
  const ownerEmail = (params.accountOwnerEmail || process.env.RESEND_ACCOUNT_OWNER || "").trim().toLowerCase();

  if (!resend) return { success: false, emailSent: false, warning: "RESEND_API_KEY is not configured", sender: "none" };
  if (!cleanTo || !cleanTo.includes("@")) return { success: false, emailSent: false, warning: "Invalid recipient email format", sender: "none" };
  if (!DEFAULT_FROM_EMAIL) return { success: false, emailSent: false, warning: "RESEND_FROM_EMAIL is not configured", sender: "none" };

  const isSandbox = DEFAULT_FROM_EMAIL.includes("onboarding@resend.dev");
  if (isSandbox && ownerEmail && cleanTo !== ownerEmail) {
    try {
      const result = await resend.emails.send({
        from: DEFAULT_FROM_EMAIL,
        to: [ownerEmail],
        subject: `[Sandbox Test for: ${cleanTo}] ${params.subject}`,
        html: `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-family:sans-serif;font-size:13px;color:#92400e"><strong>Resend Sandbox Delivery Notice:</strong><br>This notification was generated for <strong>${cleanTo}</strong>. Because the Resend testing sender cannot deliver to unverified recipients, it was delivered to the verified account owner (<strong>${ownerEmail}</strong>).</div>${params.html}`,
      });
      if (result.error) return { success: false, emailSent: false, warning: result.error.message || "Sandbox delivery failed", sender: DEFAULT_FROM_EMAIL };
      return { success: true, emailSent: true, id: result.data?.id, warning: `Delivered to sandbox account owner (${ownerEmail}).`, sender: DEFAULT_FROM_EMAIL };
    } catch (error: any) {
      return { success: false, emailSent: false, warning: error?.message || "Failed sandbox dispatch", sender: DEFAULT_FROM_EMAIL };
    }
  }

  try {
    const result = await resend.emails.send({ from: DEFAULT_FROM_EMAIL, to: [cleanTo], subject: params.subject, html: params.html });
    if (result.error) return { success: false, emailSent: false, warning: result.error.message || "Resend rejected the email", sender: DEFAULT_FROM_EMAIL };
    return { success: true, emailSent: true, id: result.data?.id, sender: DEFAULT_FROM_EMAIL };
  } catch (error: any) {
    return { success: false, emailSent: false, warning: error?.message || "Resend request failed", sender: DEFAULT_FROM_EMAIL };
  }
}

export { DOMAIN };

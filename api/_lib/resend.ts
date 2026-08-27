import { Resend } from 'resend';

export const DOMAIN = process.env.RESEND_EMAIL_DOMAIN || '';
export const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';

// Lazy Resend Client (module-level cache; Vercel reuses warm function instances,
// so this avoids re-instantiating the client on every invocation of the same instance)
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

export interface DispatchResult {
  success: boolean;
  id?: string;
  emailSent: boolean;
  warning?: string;
  sender: string;
}

// Helper to dispatch email via Resend with automatic sandbox mode detection and graceful fallbacks
export async function dispatchResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  accountOwnerEmail?: string;
}): Promise<DispatchResult> {
  const resend = getResend();
  const cleanTo = (params.to || '').trim().toLowerCase();
  const ownerEmail = (params.accountOwnerEmail || process.env.RESEND_ACCOUNT_OWNER || '').trim().toLowerCase();

  if (!resend) {
    console.info('Resend API key is not configured. Email dispatch skipped gracefully.');
    return { success: true, emailSent: false, warning: 'RESEND_API_KEY is not configured', sender: 'none' };
  }

  if (!cleanTo || !cleanTo.includes('@')) {
    console.warn(`Invalid recipient email skipped: "${params.to}"`);
    return { success: true, emailSent: false, warning: 'Invalid recipient email format', sender: 'none' };
  }

  const isDefaultSandboxSender = DEFAULT_FROM_EMAIL.includes('onboarding@resend.dev');

  // In Resend sandbox testing tier (using onboarding@resend.dev), emails can only be delivered to the verified account owner.
  // Proactively route sandbox test emails directly to ownerEmail to avoid triggering Resend validation_error.
  if (isDefaultSandboxSender && cleanTo !== ownerEmail) {
    try {
      const sandboxHtml = `
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-family: sans-serif; font-size: 13px; color: #92400e;">
          <strong>🔔 Resend Sandbox Delivery Notice:</strong><br>
          This notification was generated for <strong>${cleanTo}</strong>. Because the Resend API key is in testing mode (using onboarding@resend.dev), it has been delivered directly to your verified account email (<strong>${ownerEmail}</strong>).
        </div>
        ${params.html}
      `;

      const sandboxResult = await resend.emails.send({
        from: 'Premier Lighting <onboarding@resend.dev>',
        to: [ownerEmail],
        subject: `[Sandbox Test for: ${cleanTo}] ${params.subject}`,
        html: sandboxHtml
      });

      if (sandboxResult?.error) {
        console.warn('Sandbox dispatch to owner returned notice:', sandboxResult.error.message || sandboxResult.error);
        return {
          success: true,
          emailSent: false,
          warning: sandboxResult.error.message || 'Sandbox delivery notice',
          sender: 'Premier Lighting <onboarding@resend.dev>'
        };
      }

      return {
        success: true,
        emailSent: true,
        id: sandboxResult?.data?.id,
        warning: `Delivered to sandbox account owner (${ownerEmail}) because "${cleanTo}" is unverified in Resend testing tier.`,
        sender: 'Premier Lighting <onboarding@resend.dev>'
      };
    } catch (sandboxErr: any) {
      console.warn('Sandbox dispatch error:', sandboxErr?.message || sandboxErr);
      return {
        success: true,
        emailSent: false,
        warning: sandboxErr?.message || 'Failed sandbox dispatch',
        sender: 'Premier Lighting <onboarding@resend.dev>'
      };
    }
  }

  let usedSender = DEFAULT_FROM_EMAIL;
  let sendResult: any = null;

  try {
    sendResult = await resend.emails.send({
      from: usedSender,
      to: [cleanTo],
      subject: params.subject,
      html: params.html
    });
  } catch (err: any) {
    console.warn(`Resend initial send error with sender ${usedSender}:`, err?.message || err);
  }

  if (sendResult?.error) {
    console.warn(`Resend email delivery notice for "${cleanTo}":`, sendResult.error.message || sendResult.error);
    return {
      success: true,
      emailSent: false,
      warning: sendResult.error.message || 'Email delivery not available for this domain',
      sender: usedSender
    };
  }

  return {
    success: true,
    emailSent: true,
    id: sendResult?.data?.id,
    sender: usedSender
  };
}

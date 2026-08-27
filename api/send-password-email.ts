import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatchResendEmail, DOMAIN } from "../lib/resend";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, displayName, resetLink, type, temporaryPassword } = req.body || {};
  if (!email || !resetLink) {
    return res.status(400).json({ error: 'Missing required parameters: email and resetLink are required.' });
  }

  const name = displayName || 'User';

  let subject = 'Set Up Your Premier Lighting Account Password';
  let heading = 'Welcome to Premier Lighting';
  let subHeading = 'An administrator has created your managed user account.';
  let ctaText = 'Set Your Password Now';
  let introMessage = `Your account has been provisioned. For your security, all passwords in the Premier Lighting system are securely hashed and encrypted. Please click the button below to set or change your account password to complete your access.`;

  if (type === 'password_reset' || type === 'admin_reset') {
    subject = 'Reset Your Premier Lighting Account Password';
    heading = 'Password Reset Request';
    subHeading = 'We received a request to change or reset your account password.';
    ctaText = 'Reset Password';
    introMessage = `A password reset was requested for your managed user account (<strong>${email}</strong>). Click the button below to choose a new, secure password.`;
  } else if (type === 'password_changed') {
    subject = 'Your Premier Lighting Account Password Was Updated';
    heading = 'Password Successfully Updated';
    subHeading = 'Your account credentials have been changed.';
    ctaText = 'Access User Portal';
    introMessage = `Your Premier Lighting account password was successfully updated. If you did not make this change, please contact your administrator immediately.`;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
<tr>
  <td align="center">
    <table width="100%" max-width="580" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);">
      
      <!-- Header Banner -->
      <tr>
        <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 32px 36px; text-align: left;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <div style="display: inline-block; padding: 8px 12px; background: rgba(255, 255, 255, 0.15); border-radius: 8px; font-size: 11px; font-weight: 700; color: #ffffff; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px;">
                  PREMIER LIGHTING • SERVICE PORTAL
                </div>
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; line-height: 1.25; letter-spacing: -0.02em;">
                  ${heading}
                </h1>
                <p style="margin: 6px 0 0 0; color: #bfdbfe; font-size: 13px; line-height: 1.4;">
                  ${subHeading}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Content -->
      <tr>
        <td style="padding: 36px 36px 28px 36px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
            Hello <strong>${name}</strong>,
          </p>
          
          <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
            ${introMessage}
          </p>

          <!-- Main Action CTA Button -->
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
            <tr>
              <td align="center">
                <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); text-align: center; letter-spacing: 0.01em;">
                  ${ctaText} &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- Fallback Direct Link Box -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 24px 0 20px 0;">
            <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
              Or copy and paste this direct link:
            </p>
            <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all; font-family: monospace;">
              <a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">${resetLink}</a>
            </p>
          </div>

          <!-- Security Notice -->
          <div style="border-left: 3px solid #f59e0b; background-color: #fffbeb; padding: 12px 14px; border-radius: 4px; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
              <strong>🔒 Security Note:</strong> This password setup link is valid for 48 hours and can only be used once. Passwords are never stored in plain text and are securely cryptographically hashed.
            </p>
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background-color: #f1f5f9; padding: 20px 36px; border-top: 1px solid #e2e8f0; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
            &copy; ${new Date().getFullYear()} Premier Lighting (${DOMAIN}). All rights reserved.<br>
            This is an automated system message. Please do not reply directly to this email.
          </p>
        </td>
      </tr>

    </table>
  </td>
</tr>
  </table>
</body>
</html>
  `;

  const result = await dispatchResendEmail({
    to: email,
    subject: subject,
    html: htmlContent
  });

  return res.status(result.success ? 200 : 500).json({
    ...result,
    type: type || 'initial_setup'
  });
  } catch (error: any) {
    console.error("Server error handling /api/send-password-email:", error);
    return res.status(500).json({ success: false, emailSent: false, error: error?.message || "Internal error dispatching email" });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchResendEmail } from './_lib/resend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to } = req.body || {};
    const targetEmail = to || process.env.RESEND_TEST_EMAIL;
    if (!targetEmail) {
      return res.status(400).json({ error: 'A recipient email is required.' });
    }

    const result = await dispatchResendEmail({
      to: targetEmail,
      subject: '⚡ Premier Lighting - Email Delivery Test',
      html: `
        <div style="font-family: sans-serif; padding: 24px; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1e3a8a; margin-top: 0;">Email System Operational</h2>
          <p>This is a test notification confirming that the Resend email delivery engine is configured and operational.</p>
          <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 12px; color: #475569;">
            <p style="margin: 2px 0;"><strong>Recipient:</strong> ${targetEmail}</p>
            <p style="margin: 2px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
        </div>
      `
    });

    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(200).json({ success: true, emailSent: false, warning: e.message || 'Failed to send test email' });
  }
}

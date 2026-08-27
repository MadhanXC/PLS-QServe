import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { Resend } from 'resend';

dotenv.config();

const DOMAIN = process.env.RESEND_EMAIL_DOMAIN || '';
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || '';

// Lazy Resend Client
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

// Helper to dispatch email via Resend with automatic sandbox mode detection and graceful fallbacks
async function dispatchResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  accountOwnerEmail?: string;
}): Promise<{ success: boolean; id?: string; emailSent: boolean; warning?: string; sender: string }> {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON body parser for API requests
  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      domain: DOMAIN, 
      resendConfigured: !!process.env.RESEND_API_KEY,
      defaultFrom: DEFAULT_FROM_EMAIL,
      timestamp: new Date().toISOString() 
    });
  });

  // Diagnostic Test Email Endpoint
  app.post('/api/send-test-email', async (req, res) => {
    try {
      const { to } = req.body;
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

      return res.json(result);
    } catch (e: any) {
      return res.json({ success: true, emailSent: false, warning: e.message || 'Failed to send test email' });
    }
  });

  // Resend Email API Endpoint for Managed Users Password Setup & Change
  app.post('/api/send-password-email', async (req, res) => {
    try {
      const { email, displayName, resetLink, type, temporaryPassword } = req.body;

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

      return res.json({
        ...result,
        type: type || 'initial_setup'
      });
    } catch (err: any) {
      console.error('Server error handling /api/send-password-email:', err);
      return res.json({ success: true, emailSent: false, warning: err.message || 'Internal error dispatching email' });
    }
  });

  // Resend Email API Endpoint for Custom Service Requests & Approvals
  app.post('/api/send-custom-request-notification', async (req, res) => {
    try {
      const {
        recipientEmail,
        recipientName,
        recipientType, // 'managed_user' | 'admin' | 'customer'
        actionType, // 'new_request' | 'approved' | 'rejected' | 'scheduled' | 'service_call_created'
        cardCode,
        cardTitle,
        customerName,
        customerPhone,
        customerEmail,
        address,
        customRequestDetails,
        appointmentDate,
        appointmentTimeSlot,
        remarks,
        approvalNotes,
        portalUrl
      } = req.body;

      if (!recipientEmail) {
        return res.status(400).json({ error: 'Missing recipientEmail' });
      }

      const originUrl = portalUrl || `https://${DOMAIN}`;

      let subject = `[Action Required] Service Request: ${cardCode}`;
      let bannerTitle = 'Service Request Notification';
      let bannerSubtitle = 'A service request update has occurred for your QR Pass';
      let mainBadge = 'SERVICE REQUEST';
      let badgeBg = '#fef3c7';
      let badgeColor = '#92400e';
      let ctaText = 'Open Service Portal';
      let ctaLink = originUrl;

      if (actionType === 'service_call_created') {
        if (recipientType === 'admin') {
          subject = `📅 New Service Call Request: ${cardCode} (${appointmentDate || 'Requested Week'})`;
          bannerTitle = 'New Service Call Request';
          bannerSubtitle = `Customer ${customerName || 'Customer'} submitted a standard service request. Ready to check calendar and assign service date.`;
          mainBadge = 'READY FOR DATE SCHEDULING';
          badgeBg = '#e0f2fe';
          badgeColor = '#0369a1';
          ctaText = 'Open Calendar & Schedule Date';
        } else if (recipientType === 'customer') {
          subject = `✓ Service Request Received: Pass ${cardCode}`;
          bannerTitle = 'Service Request Received';
          bannerSubtitle = `We have received your service request for ${appointmentDate || 'your preferred week'}. The administrator is checking the schedule and will confirm your date shortly.`;
          mainBadge = 'REQUEST RECEIVED • PENDING SCHEDULE';
          badgeBg = '#dcfce7';
          badgeColor = '#166534';
          ctaText = 'View Pass Details';
        } else {
          subject = `📋 New Service Call on Pass: ${cardCode}`;
          bannerTitle = 'New Service Call Request';
          bannerSubtitle = `Customer ${customerName || 'Customer'} placed a service request for ${appointmentDate || 'upcoming week'}.`;
          mainBadge = 'NEW REQUEST';
          badgeBg = '#e0e7ff';
          badgeColor = '#3730a3';
          ctaText = 'View in Jobber Portal';
        }
      } else if (actionType === 'new_request') {
        if (recipientType === 'managed_user') {
          subject = `⚡ Action Required: New Custom Service Request for Review (${cardCode})`;
          bannerTitle = 'Review Custom Service Request';
          bannerSubtitle = `You have received a new custom service request from ${customerName || 'Customer'} requiring your approval`;
          mainBadge = 'ACTION REQUIRED • PENDING JOBBER REVIEW';
          badgeBg = '#fef3c7';
          badgeColor = '#92400e';
          ctaText = 'Accept or Decline in Jobber Portal';
        } else if (recipientType === 'admin') {
          subject = `📢 Custom Service Request Submitted (${cardCode})`;
          bannerTitle = 'Custom Request Submitted';
          bannerSubtitle = `Customer ${customerName || 'Customer'} submitted a custom request; assigned Jobber has been notified to review and respond`;
          mainBadge = 'AWAITING JOBBER REVIEW';
          badgeBg = '#e0f2fe';
          badgeColor = '#0369a1';
          ctaText = 'View Service Schedule';
        }
      } else if (actionType === 'approved') {
        subject = `✅ Custom Service Request Approved by Jobber (${cardCode})`;
        bannerTitle = 'Custom Request Approved by Jobber';
        bannerSubtitle = `The assigned Jobber has approved the custom request for Pass ${cardCode}. It is ready for appointment scheduling.`;
        mainBadge = 'APPROVED BY JOBBER • READY FOR SCHEDULING';
        badgeBg = '#dcfce7';
        badgeColor = '#166534';
        ctaText = 'Schedule Appointment in Admin Dashboard';
      } else if (actionType === 'rejected') {
        subject = `❌ Custom Service Request Declined by Jobber (${cardCode})`;
        bannerTitle = 'Custom Request Declined by Jobber';
        bannerSubtitle = `The assigned Jobber was unable to accommodate the custom request on Pass ${cardCode}`;
        mainBadge = 'DECLINED BY JOBBER';
        badgeBg = '#fee2e2';
        badgeColor = '#991b1b';
        ctaText = 'View Schedule & Records';
      } else if (actionType === 'scheduled') {
        if (recipientType === 'customer') {
          subject = `📅 Service Appointment Confirmed: Pass ${cardCode} on ${appointmentDate}`;
          bannerTitle = 'Service Appointment Confirmed';
          bannerSubtitle = `Your service appointment has been scheduled for ${appointmentDate}${appointmentTimeSlot ? ` (${appointmentTimeSlot})` : ''}. Our technician will arrive at your address during this window.`;
          mainBadge = 'APPOINTMENT CONFIRMED';
          badgeBg = '#dcfce7';
          badgeColor = '#166534';
          ctaText = 'View Service Pass';
          ctaLink = `${originUrl}/?cardId=${cardCode}`;
        } else {
          subject = `📅 Service Appointment Scheduled: Pass ${cardCode} on ${appointmentDate}`;
          bannerTitle = 'Service Appointment Scheduled';
          bannerSubtitle = `Admin has scheduled the appointment for ${appointmentDate}${appointmentTimeSlot ? ` (${appointmentTimeSlot})` : ''}`;
          mainBadge = 'CONFIRMED APPOINTMENT';
          badgeBg = '#ede9fe';
          badgeColor = '#5b21b6';
          ctaText = 'View Appointment in Portal';
        }
      }

      const addressStr = address ? `${address.streetAddress || ''}${address.aptSuite ? ' ' + address.aptSuite : ''}, ${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}` : 'Not provided';
      const effectiveCustomerEmail = customerEmail || (recipientType === 'customer' ? recipientEmail : '');

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);">
          
          <!-- Banner Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 30px 32px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block; padding: 6px 12px; background: rgba(255, 255, 255, 0.2); border-radius: 6px; font-size: 11px; font-weight: 700; color: #ffffff; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px;">
                      PREMIER LIGHTING • SERVICE DISPATCH
                    </div>
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; line-height: 1.25;">
                      ${bannerTitle}
                    </h1>
                    <p style="margin: 6px 0 0 0; color: #dbeafe; font-size: 13px;">
                      ${bannerSubtitle}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #334155;">
                Hello <strong>${recipientName || (recipientType === 'customer' ? 'Valued Customer' : 'Team Member')}</strong>,
              </p>

              <!-- Status Badge -->
              <div style="margin-bottom: 24px; padding: 10px 14px; background-color: ${badgeBg}; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05); display: inline-block;">
                <span style="font-size: 12px; font-weight: 800; color: ${badgeColor}; letter-spacing: 0.04em;">${mainBadge}</span>
              </div>

              <!-- Request Details Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 14px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                  📋 Service Call Specifications
                </h3>

                <table width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size: 13px; color: #334155;">
                  <tr>
                    <td width="36%" style="font-weight: 600; color: #64748b;">Pass Code:</td>
                    <td style="font-family: monospace; font-weight: 700; color: #2563eb;">${cardCode || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">Pass Title:</td>
                    <td>${cardTitle || 'Service Pass'}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">Customer Name:</td>
                    <td style="font-weight: 600;">${customerName || recipientName || 'N/A'}</td>
                  </tr>
                  ${effectiveCustomerEmail ? `
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">Customer Email:</td>
                    <td style="font-family: monospace; color: #334155;">${effectiveCustomerEmail}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">Contact Phone:</td>
                    <td>${customerPhone || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">Service Location:</td>
                    <td>${addressStr}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: 600; color: #64748b;">${actionType === 'scheduled' ? 'Scheduled Date:' : 'Preferred Date/Week:'}</td>
                    <td style="font-weight: 700; color: #0f172a;">${appointmentDate || 'Flexible'} ${appointmentTimeSlot ? `(${appointmentTimeSlot})` : ''}</td>
                  </tr>
                </table>

                <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
                  <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px;">Service Details & Scope:</span>
                  <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; font-size: 13px; color: #1e293b; line-height: 1.5; font-weight: 500;">
                    ${customRequestDetails || remarks || 'Standard QR Service Call'}
                  </div>
                </div>

                ${approvalNotes ? `
                <div style="margin-top: 12px;">
                  <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px;">Technician Notes:</span>
                  <div style="background-color: #f1f5f9; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #334155;">
                    ${approvalNotes}
                  </div>
                </div>
                ` : ''}
              </div>

              ${recipientType === 'managed_user' && actionType === 'new_request' ? `
              <p style="font-size: 13px; color: #475569; line-height: 1.5; margin: 0 0 20px 0;">
                🔒 <strong>Notice:</strong> As the assigned Jobber, only you have authority to accept or decline this custom service request. Please log into your portal to review the requirements and submit your response.
              </p>
              ` : ''}

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaLink}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                      ${ctaText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                &copy; ${new Date().getFullYear()} Premier Lighting (${DOMAIN}). All rights reserved.<br>
                Automated notification from the Premier Lighting Service Scheduling Engine.
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
        to: recipientEmail,
        subject: subject,
        html: html
      });

      return res.json({
        ...result,
        to: recipientEmail,
        actionType
      });
    } catch (err: any) {
      console.error('Error sending custom request notification:', err);
      return res.json({ success: true, emailSent: false, warning: err.message || 'Failed to send notification' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Premier Lighting Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

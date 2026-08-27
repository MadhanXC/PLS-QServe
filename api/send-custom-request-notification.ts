import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dispatchResendEmail, DOMAIN } from './_lib/resend.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    } = req.body || {};

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

    return res.status(200).json({
      ...result,
      to: recipientEmail,
      actionType
    });
  } catch (err: any) {
    console.error('Error sending custom request notification:', err);
    return res.status(200).json({ success: true, emailSent: false, warning: err.message || 'Failed to send notification' });
  }
}

/**
 * Email Service Client
 * Dispatches automated password setup and reset emails through Resend
 */

export interface SendPasswordEmailParams {
  email: string;
  fullName?: string;
  displayName?: string;
  temporaryPassword?: string;
  resetLink?: string;
  type: 'initial_setup' | 'reset' | 'qr_assignment' | 'admin_credentials' | 'password_reset' | 'admin_reset' | 'password_changed';
  assignedPassCount?: number;
}

export interface SendCustomRequestEmailParams {
  recipientEmail: string;
  recipientName?: string;
  recipientType: 'managed_user' | 'admin' | 'customer';
  actionType: 'new_request' | 'approved' | 'rejected' | 'scheduled' | 'completed' | 'service_call_created';
  cardCode: string;
  cardTitle: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address?: {
    streetAddress: string;
    aptSuite?: string;
    city: string;
    state: string;
    zipCode: string;
  };
  customRequestDetails: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  remarks?: string;
  approvalNotes?: string;
  portalUrl?: string;
}

export async function sendCustomRequestNotification(params: SendCustomRequestEmailParams): Promise<{ success: boolean; message?: string; skipped?: boolean }> {
  try {
    const response = await fetch('/api/send-custom-request-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, message: errorData.error || `Server responded with status ${response.status}` };
    }

    const data = await response.json().catch(() => ({}));
    if (data.skipped) {
      return { success: false, skipped: true, message: data.message || 'Notification skipped (API key not configured)' };
    }

    return {
      success: data.emailSent !== false,
      message: data.emailSent === false
        ? (data.warning || 'Email was not accepted for delivery')
        : `Notification email dispatched to ${params.recipientEmail}`
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Email delivery skipped' };
  }
}

export async function sendPasswordEmail(params: SendPasswordEmailParams): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch('/api/send-password-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server responded with status ${response.status}`);
    }

    const data = await response.json();
    return { success: true, message: `Email sent to ${params.email}` };
  } catch (err: any) {
    console.warn('Server email delivery failed:', err?.message || err);
    return { success: false, message: err?.message || 'Failed to dispatch email' };
  }
}

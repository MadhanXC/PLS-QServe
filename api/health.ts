import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DOMAIN, DEFAULT_FROM_EMAIL } from './_lib/resend.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    domain: DOMAIN,
    resendConfigured: !!process.env.RESEND_API_KEY,
    defaultFrom: DEFAULT_FROM_EMAIL,
    timestamp: new Date().toISOString()
  });
}

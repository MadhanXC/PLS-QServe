const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();
const defaultAppUrl = 'https://premierlighting.site';

export function getAppUrl(): string {
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  return (browserOrigin || configuredAppUrl || defaultAppUrl).replace(/\/$/, '');
}

export function getCardVerificationUrl(card: { id: string }): string {
  return `${getAppUrl()}/?cardId=${encodeURIComponent(card.id)}`;
}

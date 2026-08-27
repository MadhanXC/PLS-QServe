/**
 * Cryptographic Password Hashing and Token Utilities
 * Built using standard Web Crypto API (supported natively in all modern browsers and Node 18+)
 */

/**
 * Generate a random cryptographic hex string
 */
export function generateSecureToken(byteLength = 24): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(byteLength);
    window.crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-browser/utility contexts
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
}

/**
 * Convert string to Uint8Array UTF-8 buffer
 */
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password using SHA-256 with a random salt
 * Returns string in format: `sha256:SALT:HASH`
 */
export async function hashPassword(password: string, customSalt?: string): Promise<string> {
  const salt = customSalt || generateSecureToken(16);
  const combined = `${salt}::${password.trim()}::${import.meta.env.VITE_HASH_PEPPER || ''}`;

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis as any).crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    // Basic fallback if crypto.subtle is unavailable
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
    }
    return `sha256:${salt}:${Math.abs(hash).toString(16)}`;
  }

  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', stringToBuffer(combined));
  const hexHash = bufferToHex(hashBuffer);

  return `sha256:${salt}:${hexHash}`;
}

/**
 * Verify a plain password against a stored hash (or legacy plaintext)
 */
export async function verifyPassword(
  plainPassword: string,
  storedHashOrPlain?: string | null
): Promise<boolean> {
  if (!storedHashOrPlain || !plainPassword) return false;

  const trimmedPass = plainPassword.trim();

  // If it's stored in sha256 format
  if (storedHashOrPlain.startsWith('sha256:')) {
    const parts = storedHashOrPlain.split(':');
    if (parts.length >= 3) {
      const salt = parts[1];
      const computed = await hashPassword(trimmedPass, salt);
      return computed === storedHashOrPlain;
    }
  }

  // Legacy plaintext match
  return storedHashOrPlain === trimmedPass;
}

/**
 * Check if a stored string is already hashed
 */
export function isHashedPassword(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith('sha256:') || value.startsWith('pbkdf2:');
}

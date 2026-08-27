import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  addDoc,
  writeBatch,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { compressPhotosList } from './imageUtils';
import { hashPassword, verifyPassword, generateSecureToken } from './cryptoUtils';
import { sendPasswordEmail, sendCustomRequestNotification } from './emailService';
import { getCardVerificationUrl } from './appUrl';
import { getCached, setCached, invalidateCache, deduplicateRequest, updateCachedList, deduplicateList } from './cacheService';
import {
  AdminUserProfile,
  AdminRole,
  ManagedUser,
  QrCard,
  QrCardStatus,
  UsAddress,
  ServiceAvailment,
  AdminSchedule,
  InAppNotification
} from '../types';

export const USERS_COLLECTION = 'users';
export const MANAGED_USERS_COLLECTION = 'managedUsers';
export const QR_CARDS_COLLECTION = 'qrCards';
export const SCHEDULES_COLLECTION = 'schedules';
export const NOTIFICATIONS_COLLECTION = 'notifications';
export function isQrCardFullyUsed(
  card: Pick<QrCard, 'services' | 'availments'> & Partial<Pick<QrCard, 'status'>>
): boolean {
  if (card.status === 'revoked' || card.status === 'expired') return false;
  if (!card.services.length) return false;
  const availedServices = new Set<string>();
  (card.availments || []).forEach((availment) => {
    if (!availment.isCustomRequest) {
      (availment.requestedServices || []).forEach((service) => availedServices.add(service.trim()));
    }
  });
  return card.services.every((service) => availedServices.has(service.trim()));
}

/**
 * Recursively removes any `undefined` values from an object or array so Firestore updateDoc/setDoc never throws
 * "Unsupported field value: undefined".
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as any;
  }
  if (typeof data === 'object') {
    if (data instanceof Date) {
      return data.toISOString() as any;
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned;
  }
  return data;
}

/**
 * Sync user profile to Firestore with intelligent write throttling (avoids writing on every page reload/auth event)
 */
export async function syncUserProfile(
  uid: string,
  email: string,
  displayName?: string,
  role: AdminRole = 'admin'
): Promise<AdminUserProfile> {
  const profileCacheKey = `user_profile_${uid}`;
  const cached = getCached<AdminUserProfile>(profileCacheKey, 180000); // 3 minutes cache
  if (cached && cached.email === email) {
    return cached;
  }

  const userRef = doc(db, USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);
  const nowISO = new Date().toISOString();

  if (userSnap.exists()) {
    const existingData = userSnap.data() as AdminUserProfile;
    const targetDisplayName = displayName || existingData.displayName || email.split('@')[0];
    
    // Throttle writes: Only update document if displayName changed or if last login was over 2 hours ago
    const lastLoginTime = existingData.lastLoginAt ? new Date(existingData.lastLoginAt).getTime() : 0;
    const isLoginStale = Date.now() - lastLoginTime > 2 * 3600 * 1000;
    const hasNameChanged = existingData.displayName !== targetDisplayName;

    const updatedProfile: AdminUserProfile = {
      ...existingData,
      email: email || existingData.email,
      displayName: targetDisplayName,
      lastLoginAt: isLoginStale ? nowISO : (existingData.lastLoginAt || nowISO)
    };

    if (hasNameChanged || isLoginStale) {
      await updateDoc(userRef, {
        lastLoginAt: nowISO,
        displayName: targetDisplayName
      });
      invalidateCache('users');
    }

    setCached(profileCacheKey, updatedProfile);
    return updatedProfile;
  } else {
    const newProfile: AdminUserProfile = {
      uid,
      email,
      displayName: displayName || email.split('@')[0] || 'Admin User',
      role,
      status: 'active',
      createdAt: nowISO,
      lastLoginAt: nowISO
    };

    await setDoc(userRef, newProfile);
    invalidateCache('users');
    setCached(profileCacheKey, newProfile);
    return newProfile;
  }
}

/**
 * Fetch all admin users from Firestore (cached & de-duplicated)
 */
export async function getAllUsers(forceRefresh = false): Promise<AdminUserProfile[]> {
  const cacheKey = 'users_all';
  if (!forceRefresh) {
    const cached = getCached<AdminUserProfile[]>(cacheKey, 300000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const q = query(collection(db, USERS_COLLECTION), limit(100));
      const querySnapshot = await getDocs(q);
      const users: AdminUserProfile[] = [];
      querySnapshot.forEach((doc) => {
        users.push(doc.data() as AdminUserProfile);
      });
      const sorted = users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCached(cacheKey, sorted);
      return sorted;
    } catch (err) {
      console.error('Error fetching users:', err);
      return [];
    }
  });
}

/**
 * Update user status (e.g., active or suspended)
 */
export async function updateUserStatus(uid: string, status: 'active' | 'suspended'): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, { status });
  updateCachedList<AdminUserProfile>('users', (list) =>
    list.map((u) => (u.uid === uid ? { ...u, status } : u))
  );
  invalidateCache(`user_profile_${uid}`);
}

/**
 * Update user role
 */
export async function updateUserRole(uid: string, role: AdminRole): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await updateDoc(userRef, { role });
  updateCachedList<AdminUserProfile>('users', (list) =>
    list.map((u) => (u.uid === uid ? { ...u, role } : u))
  );
  invalidateCache(`user_profile_${uid}`);
}

/**
 * Delete user profile from Firestore
 */
export async function deleteUserProfile(uid: string): Promise<void> {
  const userRef = doc(db, USERS_COLLECTION, uid);
  await deleteDoc(userRef);
  updateCachedList<AdminUserProfile>('users', (list) => list.filter((u) => u.uid !== uid));
  invalidateCache(`user_profile_${uid}`);
}

/* ==========================================================================
   MANAGED END USERS & CREDENTIALS (HASHED & EMAIL DISPATCH VIA RESEND)
   ========================================================================== */

/**
 * Create a new managed end user under an admin with hashed password and automated password setup email
 */
export async function createManagedUser(
  adminUid: string,
  adminEmail: string,
  data: Omit<ManagedUser, 'id' | 'adminUid' | 'adminEmail' | 'createdAt' | 'updatedAt'>,
  options: { sendEmail?: boolean; originUrl?: string } = { sendEmail: true }
): Promise<ManagedUser> {
  const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
  const normalizedEmail = data.email.trim().toLowerCase();

  // Check if email already exists with targeted indexed query with limit(1)
  const existingQ = query(collectionRef, where('email', '==', normalizedEmail), limit(1));
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) {
    throw new Error(`A managed user with email "${normalizedEmail}" already exists.`);
  }

  const newDocRef = doc(collectionRef);
  const nowISO = new Date().toISOString();

  // Generate secure password reset/setup token
  const resetToken = generateSecureToken(24);
  const resetExpiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString(); // 48 hours validity

  let passwordHash = '';
  if (data.password && data.password.trim()) {
    passwordHash = await hashPassword(data.password.trim());
  } else {
    // Generate a secure default initial hash if no password was typed
    passwordHash = await hashPassword(generateSecureToken(16));
  }

  const newManagedUser: ManagedUser = {
    id: newDocRef.id,
    adminUid,
    adminEmail,
    displayName: data.displayName.trim(),
    email: normalizedEmail,
    password: '••••••••', // Masked placeholder to protect raw credential
    passwordHash,
    passwordResetToken: resetToken,
    passwordResetExpires: resetExpiry,
    passwordSetAt: data.password ? nowISO : undefined,
    department: data.department || 'General',
    accessLevel: data.accessLevel || 'Standard User',
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: nowISO,
    updatedAt: nowISO
  };

  await setDoc(newDocRef, newManagedUser);
  updateCachedList<ManagedUser>('managed_users', (list) => [newManagedUser, ...list]);

  // Send onboarding password setup email via Resend
  if (options.sendEmail !== false) {
    try {
      const baseUrl =
        options.originUrl ||
        (typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site');
      const resetLink = `${baseUrl}/?action=set-password&token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

      await sendPasswordEmail({
        email: normalizedEmail,
        displayName: data.displayName,
        resetLink,
        type: 'initial_setup'
      });
    } catch (emailErr) {
      console.warn('Failed to send onboarding email via Resend:', emailErr);
    }
  }

  return newManagedUser;
}

/**
 * Get managed users created by a specific admin or all managed users (cached & de-duplicated)
 */
export async function getManagedUsers(adminUid?: string, forceRefresh = false): Promise<ManagedUser[]> {
  const cacheKey = `managed_users_${adminUid || 'all'}`;
  if (!forceRefresh) {
    const cached = getCached<ManagedUser[]>(cacheKey, 300000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
      const q = adminUid ? query(collectionRef, where('adminUid', '==', adminUid)) : query(collectionRef);
      const querySnapshot = await getDocs(q);
      const managedUsers: ManagedUser[] = [];

      querySnapshot.forEach((docSnap) => {
        managedUsers.push(docSnap.data() as ManagedUser);
      });

      const deduplicated = deduplicateList(managedUsers);
      const sorted = deduplicated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCached(cacheKey, sorted);
      return sorted;
    } catch (err) {
      console.error('Error fetching managed users:', err);
      return [];
    }
  });
}

/**
 * Update a managed user record
 */
export async function updateManagedUser(
  id: string,
  data: Partial<Omit<ManagedUser, 'id' | 'adminUid' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, MANAGED_USERS_COLLECTION, id);
  const nowISO = new Date().toISOString();

  const updatePayload: any = {
    ...data,
    updatedAt: nowISO
  };

  // If a new plain password was entered in the admin edit form, hash it immediately
  if (data.password && data.password.trim() && !data.password.startsWith('sha256:') && data.password !== '••••••••') {
    updatePayload.passwordHash = await hashPassword(data.password.trim());
    updatePayload.password = '••••••••';
    updatePayload.passwordSetAt = nowISO;
  }

  await updateDoc(docRef, cleanForFirestore(updatePayload));
  updateCachedList<ManagedUser>('managed_users', (list) =>
    list.map((u) => (u.id === id ? { ...u, ...updatePayload } : u))
  );
}

/**
 * Delete a managed user record
 */
export async function deleteManagedUser(id: string): Promise<void> {
  const docRef = doc(db, MANAGED_USERS_COLLECTION, id);
  await deleteDoc(docRef);
  updateCachedList<ManagedUser>('managed_users', (list) => list.filter((u) => u.id !== id));
}

/**
 * Authenticate a managed end user with their email & password (targeted indexed lookup with limit 1)
 */
export async function authenticateManagedUser(email: string, password: string): Promise<ManagedUser> {
  const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
  const normalizedEmail = email.trim().toLowerCase();
  const rawEmail = email.trim();
  
  // 1. Direct indexed query by lowercased email with limit 1
  let querySnapshot = await getDocs(query(collectionRef, where('email', '==', normalizedEmail), limit(1)));

  // 2. Secondary fallback indexed query by raw trimmed email if different
  if (querySnapshot.empty && rawEmail !== normalizedEmail) {
    querySnapshot = await getDocs(query(collectionRef, where('email', '==', rawEmail), limit(1)));
  }

  if (querySnapshot.empty) {
    throw new Error('Account not found in managed users directory.');
  }

  const matchedDoc = querySnapshot.docs[0];
  const u = matchedDoc.data() as ManagedUser;

  // Check against passwordHash first, or fallback legacy password
  const isMatch = await verifyPassword(password, u.passwordHash || u.password);
  if (!isMatch) {
    throw new Error('Invalid password for this managed user account.');
  }

  // Auto-migrate legacy unhashed account to secure hash
  if (!u.passwordHash && u.password) {
    try {
      const secureHash = await hashPassword(password);
      await updateDoc(doc(db, MANAGED_USERS_COLLECTION, matchedDoc.id), {
        passwordHash: secureHash,
        password: '••••••••',
        updatedAt: new Date().toISOString()
      });
      invalidateCache('managed_users');
    } catch (migErr) {
      console.warn('Auto-hash migration warning:', migErr);
    }
  }

  if (u.status === 'suspended') {
    throw new Error('This user account has been suspended by an Administrator.');
  }

  if (u.status === 'inactive') {
    throw new Error('This account is currently inactive. Please contact your Administrator.');
  }

  return u;
}

/**
 * Request a password change/reset email for a managed user (targeted indexed lookup)
 */
export async function requestManagedUserPasswordReset(
  email: string,
  originUrl?: string,
  type: 'password_reset' | 'admin_reset' = 'password_reset'
): Promise<{ success: boolean; message: string }> {
  const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
  const normalizedEmail = email.trim().toLowerCase();
  const rawEmail = email.trim();

  // Direct indexed query by lowercased email
  let querySnapshot = await getDocs(query(collectionRef, where('email', '==', normalizedEmail), limit(1)));

  if (querySnapshot.empty && rawEmail !== normalizedEmail) {
    querySnapshot = await getDocs(query(collectionRef, where('email', '==', rawEmail), limit(1)));
  }

  if (querySnapshot.empty) {
    throw new Error(`No managed user account found with email "${normalizedEmail}". Please verify your email or contact an Administrator.`);
  }

  const userDoc = querySnapshot.docs[0];
  const user = userDoc.data() as ManagedUser;

  if (user.status === 'suspended') {
    throw new Error('This account has been suspended by an Administrator. Password reset is not permitted.');
  }

  const resetToken = generateSecureToken(24);
  const resetExpiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString(); // 48 hours

  await updateDoc(doc(db, MANAGED_USERS_COLLECTION, userDoc.id), {
    passwordResetToken: resetToken,
    passwordResetExpires: resetExpiry,
    updatedAt: new Date().toISOString()
  });
  invalidateCache('managed_users');

  const baseUrl =
    originUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site');
  const resetLink = `${baseUrl}/?action=set-password&token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

  const sendResult = await sendPasswordEmail({
    email: normalizedEmail,
    displayName: user.displayName || normalizedEmail,
    resetLink,
    type
  });

  return {
    success: sendResult.success,
    message: `Password setup link sent to ${normalizedEmail}. Check your inbox!`
  };
}

/**
 * Find managed user by active reset token (direct indexed query with limit 1)
 */
export async function getManagedUserByResetToken(token: string): Promise<ManagedUser> {
  if (!token || !token.trim()) {
    throw new Error('Invalid or missing password reset token.');
  }

  const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
  const q = query(collectionRef, where('passwordResetToken', '==', token.trim()), limit(1));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error('This password reset link is invalid or has already been used.');
  }

  const user = querySnapshot.docs[0].data() as ManagedUser;

  // Check token expiration
  if (user.passwordResetExpires) {
    const expiryTime = new Date(user.passwordResetExpires).getTime();
    if (Date.now() > expiryTime) {
      throw new Error('This password reset link has expired (valid for 48 hours). Please request a new one.');
    }
  }

  return user;
}

/**
 * Reset/set managed user password using a verified token
 */
export async function resetManagedUserPasswordWithToken(
  token: string,
  newPassword: string
): Promise<ManagedUser> {
  const user = await getManagedUserByResetToken(token);
  const newHash = await hashPassword(newPassword);
  const nowISO = new Date().toISOString();

  const docRef = doc(db, MANAGED_USERS_COLLECTION, user.id);
  await updateDoc(docRef, {
    passwordHash: newHash,
    password: '••••••••',
    passwordResetToken: null,
    passwordResetExpires: null,
    passwordSetAt: nowISO,
    updatedAt: nowISO
  });
  invalidateCache('managed_users');

  // Send confirmation email
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site';
    await sendPasswordEmail({
      email: user.email,
      displayName: user.displayName,
      resetLink: baseUrl,
      type: 'password_changed'
    });
  } catch (err) {
    console.warn('Password change confirmation email warning:', err);
  }

  return {
    ...user,
    passwordHash: newHash,
    password: '••••••••',
    passwordResetToken: undefined,
    passwordResetExpires: undefined,
    passwordSetAt: nowISO,
    updatedAt: nowISO
  };
}

/* ==========================================================================
   QR SERVICE CARDS MANAGEMENT
   ========================================================================== */

/**
 * Calculate initial default expiry date for unavailed card (2 years and 2 weeks from generation date)
 */
export function calculateUnavailedExpiryDate(createdDateStr?: string): string {
  const baseDate = createdDateStr ? new Date(createdDateStr) : new Date();
  if (isNaN(baseDate.getTime())) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  }
  const expiry = new Date(baseDate.getTime());
  expiry.setFullYear(expiry.getFullYear() + 2);
  expiry.setDate(expiry.getDate() + 14); // 2 weeks (14 days)
  return expiry.toISOString().split('T')[0];
}

/**
 * Calculate expiry date for availed card (1 year from first service availment date)
 */
export function calculateFirstAvailedExpiryDate(availmentDateStr?: string): string {
  const baseDate = availmentDateStr ? new Date(availmentDateStr) : new Date();
  if (isNaN(baseDate.getTime())) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  }
  const expiry = new Date(baseDate.getTime());
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry.toISOString().split('T')[0];
}

/**
 * Bulk create QR service cards with unique verification URLs and unique codes
 */
export async function createBulkQrCards(
  adminUid: string,
  params: {
    cardTitle: string;
    services: string[];
    allowCustomRequest?: boolean;
    customRequestInstructions?: string;
    validUntil?: string;
    targetUsers: Array<{ id?: string; name?: string; email?: string }>;
    quantityPerUser?: number;
  }
): Promise<QrCard[]> {
  const collectionRef = collection(db, QR_CARDS_COLLECTION);
  const createdCards: QrCard[] = [];
  const nowISO = new Date().toISOString();

  if (!params.targetUsers || params.targetUsers.length === 0) {
    throw new Error('At least one assigned user must be specified before generating QR cards.');
  }

  const usersList = params.targetUsers;
  const qty = params.quantityPerUser && params.quantityPerUser > 0 ? params.quantityPerUser : 1;

  // Use Firestore Batches (up to 400 per batch chunk to be safe within 500 limit)
  let batch = writeBatch(db);
  let batchCount = 0;

  // Default initial validity: 2 years & 2 weeks from generated date if unavailed
  const initialValidity = params.validUntil || calculateUnavailedExpiryDate(nowISO);

  for (const targetUser of usersList) {
    for (let i = 0; i < qty; i++) {
      const newDocRef = doc(collectionRef);
      const cardId = newDocRef.id;

      // Unique card code generator
      const randomAlphanumeric = Math.random().toString(36).substring(2, 7).toUpperCase();
      const seqNumber = Math.floor(1000 + Math.random() * 9000);
      const cardCode = `PWR-${seqNumber}-${randomAlphanumeric}`;

      // Unique Web Verification URL for scan & direct link checking
      const verificationUrl = getCardVerificationUrl({ id: cardId });

      const card: QrCard = {
        id: cardId,
        adminUid,
        cardTitle: params.cardTitle,
        cardCode,
        assignedUserId: targetUser.id || '',
        assignedUserName: targetUser.name || 'Unassigned User',
        assignedUserEmail: targetUser.email || '',
        services: params.services,
        allowCustomRequest: params.allowCustomRequest !== undefined ? params.allowCustomRequest : true,
        customRequestInstructions: params.customRequestInstructions || '',
        validUntil: initialValidity,
        status: 'active',
        qrData: verificationUrl, // The QR code points directly to the unique link
        verificationUrl,
        createdAt: nowISO,
        updatedAt: nowISO
      };

      batch.set(newDocRef, card);
      createdCards.push(card);
      batchCount++;

      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  updateCachedList<QrCard>('qrcards', (list) => deduplicateList([...createdCards, ...list]));
  return deduplicateList(createdCards);
}

/**
 * Fetch a single QR Card by ID (for public scan/link verification) with multi-tier cache & deduplication
 */
export async function getQrCardById(rawCardId: string, forceRefresh = false): Promise<QrCard | null> {
  if (!rawCardId) return null;
  const cardId = rawCardId.trim().replace(/^["']|["']$/g, '');
  const cacheKey = `card_${cardId}`;

  if (!forceRefresh) {
    const cached = getCached<QrCard>(cacheKey, 300000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      // 1. Direct document lookup by ID (1 single read)
      const docRef = doc(db, QR_CARDS_COLLECTION, cardId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const card = snap.data() as QrCard;
        setCached(cacheKey, card);
        return card;
      }

      // 2. Secondary fallback search by cardCode (exact match with limit 1)
      const collectionRef = collection(db, QR_CARDS_COLLECTION);
      const q1 = query(collectionRef, where('cardCode', '==', cardId), limit(1));
      const querySnap1 = await getDocs(q1);
      if (!querySnap1.empty) {
        const card = querySnap1.docs[0].data() as QrCard;
        setCached(cacheKey, card);
        return card;
      }

      // 3. Tertiary fallback search by cardCode (uppercase with limit 1)
      const upperId = cardId.toUpperCase();
      if (upperId !== cardId) {
        const q2 = query(collectionRef, where('cardCode', '==', upperId), limit(1));
        const querySnap2 = await getDocs(q2);
        if (!querySnap2.empty) {
          const card = querySnap2.docs[0].data() as QrCard;
          setCached(cacheKey, card);
          return card;
        }
      }

      return null;
    } catch (err) {
      console.error('Error fetching QR card by ID:', err);
      return null;
    }
  });
}

/**
 * Get QR cards (cached & de-duplicated)
 */
export async function getQrCards(
  options?: { adminUid?: string; userEmail?: string },
  forceRefresh = false
): Promise<QrCard[]> {
  const cacheKey = `qrcards_${options?.adminUid || ''}_${options?.userEmail || 'all'}`;

  if (!forceRefresh) {
    const cached = getCached<QrCard[]>(cacheKey, 300000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const collectionRef = collection(db, QR_CARDS_COLLECTION);
      let q = query(collectionRef);

      if (options?.adminUid) {
        q = query(collectionRef, where('adminUid', '==', options.adminUid));
      } else if (options?.userEmail) {
        q = query(collectionRef, where('assignedUserEmail', '==', options.userEmail));
      }

      const snapshot = await getDocs(q);
      const cards: QrCard[] = [];
      snapshot.forEach((docSnap) => {
        cards.push(docSnap.data() as QrCard);
      });

      const deduplicated = deduplicateList(cards);
      const sorted = deduplicated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCached(cacheKey, sorted);
      return sorted;
    } catch (err) {
      console.error('Error getting QR cards:', err);
      return [];
    }
  });
}

/**
 * Real-time subscription to QR Cards for an Admin (instant sync across devices/jobbers)
 */
export function subscribeToQrCards(
  adminUid: string,
  onUpdate: (cards: QrCard[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const collectionRef = collection(db, QR_CARDS_COLLECTION);
    const q = query(collectionRef, where('adminUid', '==', adminUid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cards: QrCard[] = [];
        snapshot.forEach((docSnap) => {
          cards.push(docSnap.data() as QrCard);
        });
        const deduplicated = deduplicateList(cards);
        const sorted = deduplicated.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCached(`qrcards_admin_${adminUid}`, sorted);
        onUpdate(sorted);
      },
      (error) => {
        console.warn('Real-time QR cards snapshot error:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to initialize QR cards real-time listener:', err);
    return () => {};
  }
}

/**
 * Real-time subscription to QR Cards assigned to a specific Jobber (by email)
 */
export function subscribeToUserQrCards(
  userEmail: string,
  onUpdate: (cards: QrCard[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const collectionRef = collection(db, QR_CARDS_COLLECTION);
    const normalizedEmail = userEmail.trim().toLowerCase();
    const q = query(collectionRef, where('assignedUserEmail', '==', normalizedEmail));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cards: QrCard[] = [];
        snapshot.forEach((docSnap) => {
          cards.push(docSnap.data() as QrCard);
        });
        const deduplicated = deduplicateList(cards);
        const sorted = deduplicated.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        onUpdate(sorted);
      },
      (error) => {
        console.warn('Real-time user QR cards snapshot error:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to initialize user QR cards real-time listener:', err);
    return () => {};
  }
}

/**
 * Real-time subscription to Managed Users for an Admin
 */
export function subscribeToManagedUsers(
  adminUid: string,
  onUpdate: (users: ManagedUser[]) => void,
  onError?: (err: Error) => void
): () => void {
  try {
    const collectionRef = collection(db, MANAGED_USERS_COLLECTION);
    const q = query(collectionRef, where('adminUid', '==', adminUid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const users: ManagedUser[] = [];
        snapshot.forEach((docSnap) => {
          users.push(docSnap.data() as ManagedUser);
        });
        const deduplicated = deduplicateList(users);
        const sorted = deduplicated.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCached(`managed_users_${adminUid}`, sorted);
        onUpdate(sorted);
      },
      (error) => {
        console.warn('Real-time managed users snapshot error:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to initialize managed users real-time listener:', err);
    return () => {};
  }
}

/**
 * Real-time subscription to In-App Notifications
 */
export function subscribeToInAppNotifications(
  recipientEmailOrUid: string,
  onUpdate: (notifs: InAppNotification[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!recipientEmailOrUid) return () => {};
  try {
    const normalized = recipientEmailOrUid.trim().toLowerCase();
    const notifsCol = collection(db, NOTIFICATIONS_COLLECTION);
    const q = query(notifsCol, where('recipientEmail', '==', normalized));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: InAppNotification[] = [];
        snapshot.forEach((docSnap) => {
          notifs.push(docSnap.data() as InAppNotification);
        });
        const sorted = notifs
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10);
        onUpdate(sorted);
      },
      (error) => {
        console.warn('Real-time notifications snapshot error:', error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.warn('Failed to initialize notifications real-time listener:', err);
    return () => {};
  }
}

/**
 * Update full details of a QR Card
 */
export async function updateQrCardDetails(
  id: string,
  data: Partial<Pick<QrCard, 'cardTitle' | 'assignedUserId' | 'assignedUserName' | 'assignedUserEmail' | 'services' | 'allowCustomRequest' | 'customRequestInstructions' | 'validUntil' | 'status'>>
): Promise<void> {
  const docRef = doc(db, QR_CARDS_COLLECTION, id);
  const nowISO = new Date().toISOString();
  await updateDoc(docRef, cleanForFirestore({
    ...data,
    updatedAt: nowISO
  }));
  updateCachedList<QrCard>('qrcards', (list) =>
    list.map((c) => (c.id === id ? { ...c, ...data, updatedAt: nowISO } : c))
  );
  invalidateCache(`card_${id}`);
}

/**
 * Update status of a QR Card
 */
export async function updateQrCardStatus(id: string, status: QrCardStatus): Promise<void> {
  const docRef = doc(db, QR_CARDS_COLLECTION, id);
  const nowISO = new Date().toISOString();
  await updateDoc(docRef, {
    status,
    updatedAt: nowISO
  });
  updateCachedList<QrCard>('qrcards', (list) =>
    list.map((c) => (c.id === id ? { ...c, status, updatedAt: nowISO } : c))
  );
  invalidateCache(`card_${id}`);
}

export async function restoreQrCardService(
  cardCodeOrId: string,
  availmentId: string,
  serviceName: string
): Promise<QrCard> {
  const card = await getQrCardById(cardCodeOrId, true);
  if (!card) throw new Error(`QR Card "${cardCodeOrId}" not found in system.`);
  const targetService = serviceName.trim();
  const updatedAvailments = (card.availments || []).map((availment) => {
    if (availment.id !== availmentId || availment.isCustomRequest) return cleanForFirestore(availment);
    return cleanForFirestore({
      ...availment,
      requestedServices: (availment.requestedServices || []).filter((service) => service.trim() !== targetService)
    });
  });
  const availedServices = new Set<string>();
  updatedAvailments.forEach((availment) => {
    if (!availment.isCustomRequest) {
      (availment.requestedServices || []).forEach((service) => availedServices.add(service.trim()));
    }
  });
  const status: QrCardStatus = card.services.length > 0 && card.services.every((service) => availedServices.has(service.trim()))
    ? 'used'
    : 'active';
  const updatedCard = cleanForFirestore({ ...card, availments: updatedAvailments, status, updatedAt: new Date().toISOString() }) as QrCard;
  await updateDoc(doc(db, QR_CARDS_COLLECTION, card.id), {
    availments: updatedAvailments,
    status,
    updatedAt: updatedCard.updatedAt
  });
  invalidateCache('qrcards');
  invalidateCache(`card_${card.id}`);
  invalidateCache(`card_${card.cardCode}`);
  return updatedCard;
}

/**
 * Delete a QR Card
 */
export async function deleteQrCard(id: string): Promise<void> {
  const docRef = doc(db, QR_CARDS_COLLECTION, id);
  await deleteDoc(docRef);
  updateCachedList<QrCard>('qrcards', (list) => list.filter((c) => c.id !== id));
  invalidateCache(`card_${id}`);
}

/**
 * Delete multiple QR Cards in bulk
 */
export async function deleteBulkQrCards(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const deletePromises = ids.map((id) => deleteDoc(doc(db, QR_CARDS_COLLECTION, id)));
  await Promise.all(deletePromises);
  const idSet = new Set(ids);
  updateCachedList<QrCard>('qrcards', (list) => list.filter((c) => !idSet.has(c.id)));
  ids.forEach((id) => invalidateCache(`card_${id}`));
}

/**
 * Create an In-App Notification in Firestore and cache
 */
export async function createInAppNotification(notif: Omit<InAppNotification, 'id' | 'createdAt'>): Promise<InAppNotification> {
  const notifsCol = collection(db, NOTIFICATIONS_COLLECTION);
  const nowISO = new Date().toISOString();
  const docRef = doc(notifsCol);
  const newNotif: InAppNotification = cleanForFirestore({
    id: docRef.id,
    ...notif,
    createdAt: nowISO
  });

  try {
    await setDoc(docRef, cleanForFirestore(newNotif));
    updateCachedList<InAppNotification>('in_app_notifications', (list) => [newNotif, ...list]);
  } catch (e) {
    console.warn('Failed to write in-app notification to Firestore:', e);
  }
  return newNotif;
}

/**
 * Get In-App Notifications for a recipient (Admin or Managed User)
 */
export async function getInAppNotifications(recipientEmailOrUid: string, forceRefresh = false): Promise<InAppNotification[]> {
  if (!recipientEmailOrUid) return [];
  const normalized = recipientEmailOrUid.trim().toLowerCase();
  const cacheKey = `notifs_${normalized}`;

  if (!forceRefresh) {
    const cached = getCached<InAppNotification[]>(cacheKey, 60000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const notifsCol = collection(db, NOTIFICATIONS_COLLECTION);
      const q = query(
        notifsCol,
        where('recipientEmail', '==', normalized),
        limit(10)
      );
      const snap = await getDocs(q);
      const results: InAppNotification[] = [];
      snap.forEach((d) => {
        results.push(d.data() as InAppNotification);
      });

      // Also try querying by recipientUid if no results by email
      if (results.length === 0) {
        const qUid = query(
          notifsCol,
          where('recipientUid', '==', recipientEmailOrUid),
          limit(10)
        );
        const snapUid = await getDocs(qUid);
        snapUid.forEach((d) => {
          results.push(d.data() as InAppNotification);
        });
      }

      const sorted = results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCached(cacheKey, sorted);
      return sorted;
    } catch (e) {
      console.warn('Error fetching in-app notifications:', e);
      return [];
    }
  });
}

/**
 * Mark an In-App Notification as read
 */
export async function markInAppNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(docRef, { read: true });
    updateCachedList<InAppNotification>('in_app_notifications', (list) =>
      list.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  } catch (e) {
    console.warn('Error marking notification as read:', e);
  }
}

export async function markAllInAppNotificationsAsRead(notifications: InAppNotification[]): Promise<void> {
  await Promise.all(
    notifications
      .filter((notification) => !notification.read)
      .map((notification) => markInAppNotificationAsRead(notification.id))
  );
}

/**
 * Submit a service availment request for a QR Card (supports both standard services and custom requests)
 */
export async function submitServiceAvailment(
  cardId: string,
  availmentData: {
    requestedServices: string[];
    contactPersonName: string;
    contactNumber: string;
    contactEmail?: string;
    address: UsAddress;
    appointmentDate?: string;
    appointmentTimeSlot?: string;
    targetWeek?: string;
    photos?: string[];
    remarks?: string;
    isCustomRequest?: boolean;
    customRequestDetails?: string;
  }
): Promise<QrCard> {
  const docRef = doc(db, QR_CARDS_COLLECTION, cardId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Card document not found in registry.');
  }

  const currentCard = snap.data() as QrCard;
  const isCustomReq = !!availmentData.isCustomRequest;

  // Basic contact validations
  if (!availmentData.contactPersonName?.trim()) {
    throw new Error('Please enter your full contact name.');
  }
  if (!availmentData.contactNumber?.trim()) {
    throw new Error('Please enter your contact phone number.');
  }
  if (!availmentData.contactEmail?.trim()) {
    throw new Error('Please enter your contact email address.');
  }

  // Validation based on mode
  if (!isCustomReq) {
    if (!availmentData.requestedServices || availmentData.requestedServices.length === 0) {
      throw new Error('Please select at least 1 service to avail.');
    }
    if (availmentData.requestedServices.length > 2) {
      throw new Error('Only up to 2 services can be availed at a time.');
    }
    if (!availmentData.targetWeek?.trim() && !availmentData.appointmentDate?.trim()) {
      throw new Error('Please select your preferred week for the service call.');
    }
  } else {
    if (!availmentData.customRequestDetails?.trim() && !availmentData.remarks?.trim()) {
      throw new Error('Please describe your custom service request.');
    }
    if (!availmentData.targetWeek?.trim()) {
      throw new Error('Please select a preferred week for your custom service request.');
    }
  }

  // Enforce mandatory photo attachment
  if (!availmentData.photos || availmentData.photos.length === 0) {
    throw new Error('Photo attachment is required. Please upload or take at least 1 photo of the issue/fixture.');
  }

  // Address validation
  if (!availmentData.address?.streetAddress?.trim() || !availmentData.address?.city?.trim() || !availmentData.address?.zipCode?.trim()) {
    throw new Error('Please provide a complete service address including street, city, state, and zip code.');
  }

  const cleanAddress: UsAddress = {
    streetAddress: availmentData.address.streetAddress.trim(),
    aptSuite: (availmentData.address.aptSuite || '').trim(),
    city: availmentData.address.city.trim(),
    state: (availmentData.address.state || 'CA').trim(),
    zipCode: availmentData.address.zipCode.trim()
  };

  const compressedPhotos = await compressPhotosList(availmentData.photos || []);

  const newAvailmentId = `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const targetWeekValue = availmentData.targetWeek?.trim() || (availmentData.appointmentDate ? `Week of ${availmentData.appointmentDate}` : '');
  const customerEmailClean = (availmentData.contactEmail || '').trim().toLowerCase();

  const newAvailment: ServiceAvailment = cleanForFirestore({
    id: newAvailmentId,
    requestedServices: isCustomReq
      ? ['Custom Service Request']
      : (availmentData.requestedServices || []),
    contactPersonName: availmentData.contactPersonName.trim(),
    contactNumber: availmentData.contactNumber.trim(),
    contactEmail: customerEmailClean,
    address: cleanAddress,
    appointmentDate: availmentData.appointmentDate || '',
    appointmentTimeSlot: availmentData.appointmentTimeSlot || '',
    targetWeek: targetWeekValue,
    photos: compressedPhotos,
    remarks: availmentData.remarks?.trim() || '',
    timestamp: new Date().toISOString(),
    status: 'pending',
    isCustomRequest: isCustomReq,
    customRequestDetails: isCustomReq ? (availmentData.customRequestDetails || availmentData.remarks || '') : '',
    // Standard service requests do NOT need jobber approval; custom requests require jobber approval
    approvalStatus: isCustomReq ? 'pending_approval' : undefined,
    managedUserId: currentCard.assignedUserId || undefined,
    managedUserName: currentCard.assignedUserName || undefined,
    managedUserEmail: currentCard.assignedUserEmail || undefined
  });

  const updatedAvailments = cleanForFirestore([
    newAvailment,
    ...(currentCard.availments ? currentCard.availments.map((a) => cleanForFirestore(a)) : [])
  ]);

  // Calculate Validity Rule:
  // 1 year starting from the date a service is availed for the FIRST time.
  let firstAvailedDate = currentCard.firstAvailedDate;
  let finalValidUntil = currentCard.validUntil;

  if (!firstAvailedDate && (!currentCard.availments || currentCard.availments.length === 0)) {
    firstAvailedDate = availmentData.appointmentDate || new Date().toISOString().split('T')[0];
    finalValidUntil = calculateFirstAvailedExpiryDate(firstAvailedDate);
  }
  
  // Save address & contact info if card did not have them before (or maintain existing saved info)
  const savedAddress = currentCard.savedAddress ? {
    streetAddress: currentCard.savedAddress.streetAddress || '',
    aptSuite: currentCard.savedAddress.aptSuite || '',
    city: currentCard.savedAddress.city || '',
    state: currentCard.savedAddress.state || 'CA',
    zipCode: currentCard.savedAddress.zipCode || ''
  } : cleanAddress;

  const savedContactName = currentCard.savedContactName || availmentData.contactPersonName.trim();
  const savedContactEmail = currentCard.savedContactEmail || customerEmailClean;
  const savedContactPhone = currentCard.savedContactPhone || availmentData.contactNumber.trim();
  const availedStandardServices = new Set<string>();
  updatedAvailments.forEach((availment) => {
    if (!availment.isCustomRequest) {
      (availment.requestedServices || []).forEach((service) => availedStandardServices.add(service.trim()));
    }
  });
  const allStandardServicesUsed =
    currentCard.services.length > 0 &&
    currentCard.services.every((service) => availedStandardServices.has(service.trim()));
  const nextCardStatus: QrCardStatus = allStandardServicesUsed ? 'used' : 'active';

  const updateCardPayload = cleanForFirestore({
    savedAddress,
    savedContactName,
    savedContactEmail,
    savedContactPhone,
    availments: updatedAvailments,
    firstAvailedDate: firstAvailedDate || null,
    validUntil: finalValidUntil,
    status: nextCardStatus,
    updatedAt: new Date().toISOString()
  });

  await updateDoc(docRef, updateCardPayload);

  invalidateCache('qrcards');
  invalidateCache(`card_${cardId}`);
  invalidateCache(`card_${currentCard.cardCode}`);
  if (currentCard.adminUid) {
    invalidateCache(`booked_counts_${currentCard.adminUid}`);
    invalidateCache(`booked_reqs_${currentCard.adminUid}`);
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site';
  const customDetails = availmentData.customRequestDetails || availmentData.remarks || (newAvailment.requestedServices || []).join(', ');

  // Resolve Jobber information
  let jobberEmail = (currentCard.assignedUserEmail || '').trim().toLowerCase();
  let jobberName = currentCard.assignedUserName || 'Jobber';
  const jobberId = currentCard.assignedUserId || '';

  if (isCustomReq) {
    // ----------------------------------------------------
    // CUSTOM SERVICE REQUEST FLOW (Jobber review & approval)
    // ----------------------------------------------------
    const dispatchJobberNotifications = async () => {
      try {
        if (!jobberEmail && jobberId) {
          const muSnap = await getDoc(doc(db, MANAGED_USERS_COLLECTION, jobberId));
          if (muSnap.exists()) {
            const muData = muSnap.data() as ManagedUser;
            jobberEmail = (muData.email || '').trim().toLowerCase();
            jobberName = muData.displayName || jobberName;
          }
        }

        if (jobberEmail) {
          // In-App Notification for Jobber
          createInAppNotification({
            recipientEmail: jobberEmail,
            recipientType: 'managed_user',
            recipientUid: jobberId,
            title: '⚡ Action Required: New Custom Request for Review',
            message: `Customer ${availmentData.contactPersonName} submitted a custom request for ${targetWeekValue || 'upcoming week'} on Pass ${currentCard.cardCode}: "${customDetails}". Please accept or decline this request in your Jobber portal.`,
            type: 'custom_request_created',
            cardCode: currentCard.cardCode,
            availmentId: newAvailmentId,
            read: false
          }).catch((e) => console.warn('In-app notif error to Jobber:', e));

          // Automated Email Notification to Jobber
          sendCustomRequestNotification({
            recipientEmail: jobberEmail,
            recipientName: jobberName,
            recipientType: 'managed_user',
            actionType: 'new_request',
            cardCode: currentCard.cardCode,
            cardTitle: currentCard.cardTitle,
            customerName: availmentData.contactPersonName,
            customerPhone: availmentData.contactNumber,
            customerEmail: customerEmailClean,
            address: cleanAddress,
            customRequestDetails: customDetails,
            appointmentDate: targetWeekValue ? `Target Week: ${targetWeekValue}` : undefined,
            appointmentTimeSlot: availmentData.appointmentTimeSlot,
            remarks: availmentData.remarks,
            portalUrl: baseUrl
          }).then((res) => {
            if (res.success) {
              console.log(`Custom request email dispatched to Jobber (${jobberEmail})`);
            }
          }).catch((e) => console.warn('Custom request email to Jobber failed:', e));
        }
      } catch (err) {
        console.warn('Error resolving Jobber for custom request notification:', err);
      }
    };

    dispatchJobberNotifications();

    // In-App Notification & Email for Admin
    if (currentCard.adminUid) {
      getDoc(doc(db, USERS_COLLECTION, currentCard.adminUid))
        .then((adminSnap) => {
          const adminData = adminSnap.data() as AdminUserProfile | undefined;
          const adminEmail = adminData?.email || 'admin@premierlighting.site';
          
          createInAppNotification({
            recipientEmail: adminEmail.toLowerCase(),
            recipientType: 'admin',
            recipientUid: currentCard.adminUid,
            title: '📢 Custom Service Request Submitted',
            message: `Custom request submitted on Pass ${currentCard.cardCode} for ${availmentData.contactPersonName} (Target: ${targetWeekValue || 'Week'}). Assigned to ${jobberName} for review and approval.`,
            type: 'custom_request_created',
            cardCode: currentCard.cardCode,
            availmentId: newAvailmentId,
            read: false
          }).catch((e) => console.warn('Admin in-app notif error:', e));

          sendCustomRequestNotification({
            recipientEmail: adminEmail,
            recipientName: adminData?.displayName || 'Administrator',
            recipientType: 'admin',
            actionType: 'new_request',
            cardCode: currentCard.cardCode,
            cardTitle: currentCard.cardTitle,
            customerName: availmentData.contactPersonName,
            customerPhone: availmentData.contactNumber,
            customerEmail: customerEmailClean,
            address: cleanAddress,
            customRequestDetails: customDetails,
            appointmentDate: targetWeekValue ? `Target Week: ${targetWeekValue}` : undefined,
            appointmentTimeSlot: availmentData.appointmentTimeSlot,
            remarks: availmentData.remarks,
            portalUrl: baseUrl
          }).catch((e) => console.warn('Custom request email to admin failed:', e));
        })
        .catch((e) => console.warn('Admin user fetch failed for notification:', e));
    }

    // Confirmation Email to Customer
    if (customerEmailClean) {
      sendCustomRequestNotification({
        recipientEmail: customerEmailClean,
        recipientName: availmentData.contactPersonName,
        recipientType: 'customer',
        actionType: 'new_request',
        cardCode: currentCard.cardCode,
        cardTitle: currentCard.cardTitle,
        customerName: availmentData.contactPersonName,
        customerPhone: availmentData.contactNumber,
        customerEmail: customerEmailClean,
        address: cleanAddress,
        customRequestDetails: customDetails,
        appointmentDate: targetWeekValue ? `Target Week: ${targetWeekValue}` : undefined,
        remarks: 'Your custom request has been submitted to your assigned technician. Once reviewed, our administrator will schedule the service date.',
        portalUrl: baseUrl
      }).catch((e) => console.warn('Customer confirmation email failed:', e));
    }
  } else {
    // ----------------------------------------------------
    // STANDARD SERVICE CALL REQUEST FLOW
    // (Customer selects target week -> Admin checks calendar & schedules date)
    // ----------------------------------------------------
    if (currentCard.adminUid) {
      getDoc(doc(db, USERS_COLLECTION, currentCard.adminUid))
        .then((adminSnap) => {
          const adminData = adminSnap.data() as AdminUserProfile | undefined;
          const adminEmail = adminData?.email || 'admin@premierlighting.site';

          createInAppNotification({
            recipientEmail: adminEmail.toLowerCase(),
            recipientType: 'admin',
            recipientUid: currentCard.adminUid,
            title: '📅 New Service Call Request (Ready to Schedule)',
            message: `Customer ${availmentData.contactPersonName} (${customerEmailClean}) submitted a standard service request for ${targetWeekValue || 'upcoming week'} on Pass ${currentCard.cardCode}. Please check your calendar schedule and assign an appointment date.`,
            type: 'service_request_created',
            cardCode: currentCard.cardCode,
            availmentId: newAvailmentId,
            read: false
          }).catch((e) => console.warn('Admin in-app notif error:', e));

          sendCustomRequestNotification({
            recipientEmail: adminEmail,
            recipientName: adminData?.displayName || 'Administrator',
            recipientType: 'admin',
            actionType: 'service_call_created',
            cardCode: currentCard.cardCode,
            cardTitle: currentCard.cardTitle,
            customerName: availmentData.contactPersonName,
            customerPhone: availmentData.contactNumber,
            customerEmail: customerEmailClean,
            address: cleanAddress,
            customRequestDetails: (availmentData.requestedServices || []).join(', '),
            appointmentDate: targetWeekValue ? `Target Week: ${targetWeekValue}` : undefined,
            remarks: availmentData.remarks,
            portalUrl: baseUrl
          }).catch((e) => console.warn('Admin service call email failed:', e));
        })
        .catch((e) => console.warn('Admin fetch failed for service call notification:', e));
    }

    // Email and In-App notification for Jobber
    if (jobberEmail) {
      createInAppNotification({
        recipientEmail: jobberEmail,
        recipientType: 'managed_user',
        recipientUid: jobberId,
        title: `📋 New Service Request on Pass ${currentCard.cardCode}`,
        message: `Customer ${availmentData.contactPersonName} requested service for ${targetWeekValue || 'upcoming week'}: ${(availmentData.requestedServices || []).join(', ')}. The administrator will schedule the date on the calendar.`,
        type: 'service_request_created',
        cardCode: currentCard.cardCode,
        availmentId: newAvailmentId,
        read: false
      }).catch((e) => console.warn('Jobber info in-app notif error:', e));

      sendCustomRequestNotification({
        recipientEmail: jobberEmail,
        recipientName: jobberName,
        recipientType: 'managed_user',
        actionType: 'service_call_created',
        cardCode: currentCard.cardCode,
        cardTitle: currentCard.cardTitle,
        customerName: availmentData.contactPersonName,
        customerPhone: availmentData.contactNumber,
        customerEmail: customerEmailClean,
        address: cleanAddress,
        customRequestDetails: (availmentData.requestedServices || []).join(', '),
        appointmentDate: targetWeekValue ? `Preferred Week: ${targetWeekValue}` : undefined,
        remarks: availmentData.remarks || 'Standard QR Service Call Request',
        portalUrl: baseUrl
      }).then((res) => {
        if (res.success) {
          console.log(`[Email Dispatch] Service request email dispatched to assigned holder (${jobberEmail})`);
        }
      }).catch((e) => console.warn('Jobber service call email failed:', e));
    }

    // Confirmation Email to Customer (Contact Person on Card)
    if (customerEmailClean) {
      sendCustomRequestNotification({
        recipientEmail: customerEmailClean,
        recipientName: availmentData.contactPersonName,
        recipientType: 'customer',
        actionType: 'service_call_created',
        cardCode: currentCard.cardCode,
        cardTitle: currentCard.cardTitle,
        customerName: availmentData.contactPersonName,
        customerPhone: availmentData.contactNumber,
        customerEmail: customerEmailClean,
        address: cleanAddress,
        customRequestDetails: (availmentData.requestedServices || []).join(', '),
        appointmentDate: targetWeekValue ? `Preferred Week: ${targetWeekValue}` : undefined,
        remarks: 'Your service request has been received. Our administrator will review the schedule calendar and confirm your exact service date and time slot shortly.',
        portalUrl: baseUrl
      }).then((res) => {
        if (res.success) {
          console.log(`[Email Dispatch] Service request email dispatched to customer contact person (${customerEmailClean})`);
        }
      }).catch((e) => console.warn('Customer confirmation email failed:', e));
    }
  }

  return {
    ...currentCard,
    savedAddress,
    availments: updatedAvailments,
    firstAvailedDate: firstAvailedDate || undefined,
    validUntil: finalValidUntil,
    status: nextCardStatus,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Managed User Response (Accept or Reject) for Custom Service Requests
 * Strictly enforces that ONLY the assigned managed user can accept or reject
 */
export async function respondToCustomRequest(
  cardCodeOrId: string,
  availmentId: string,
  action: 'accept' | 'reject',
  responder: {
    id: string;
    email: string;
    displayName: string;
  },
  approvalNotes?: string
): Promise<QrCard> {
  const collectionRef = collection(db, QR_CARDS_COLLECTION);
  let q = query(collectionRef, where('cardCode', '==', cardCodeOrId.trim()), limit(1));
  let snap = await getDocs(q);

  if (snap.empty) {
    // Try by Doc ID
    const docRef = doc(db, QR_CARDS_COLLECTION, cardCodeOrId.trim());
    const singleSnap = await getDoc(docRef);
    if (!singleSnap.exists()) {
      throw new Error(`QR Card "${cardCodeOrId}" not found in system.`);
    }
    snap = { docs: [singleSnap], empty: false } as any;
  }

  const docSnap = snap.docs[0];
  const cardData = docSnap.data() as QrCard;
  const availments = cardData.availments || [];

  const targetAvailment = availments.find((a) => a.id === availmentId);
  if (!targetAvailment) {
    throw new Error(`Custom request ${availmentId} not found on this card.`);
  }

  // Security Check: Only the assigned managed user or user matching ID/Email can accept or reject
  const normalizedResponderEmail = (responder.email || '').toLowerCase().trim();
  const normalizedAssignedEmail = (cardData.assignedUserEmail || '').toLowerCase().trim();
  const isAuthorized =
    cardData.assignedUserId === responder.id ||
    normalizedAssignedEmail === normalizedResponderEmail ||
    !cardData.assignedUserId; // If unassigned, allow assigned responder

  if (!isAuthorized) {
    throw new Error('Unauthorized: Only the assigned managed user for this pass can accept or reject this custom service request.');
  }

  const nowISO = new Date().toISOString();
  const isApproved = action === 'accept';

  const updatedAvailments = availments.map((a) => {
    if (a.id === availmentId) {
      const updated: any = {
        ...a,
        approvalStatus: isApproved ? 'approved' : 'rejected',
        status: isApproved ? 'in_progress' : 'rejected',
        approvalNotes: (approvalNotes || a.approvalNotes || '').trim(),
        managedUserId: responder.id || cardData.assignedUserId || '',
        managedUserName: responder.displayName || cardData.assignedUserName || '',
        managedUserEmail: responder.email || cardData.assignedUserEmail || ''
      };

      if (isApproved) {
        updated.approvedAt = nowISO;
      } else {
        updated.rejectedAt = nowISO;
      }

      return cleanForFirestore(updated);
    }
    return cleanForFirestore(a);
  });

  const cardUpdatePayload = cleanForFirestore({
    availments: updatedAvailments,
    updatedAt: nowISO
  });

  await updateDoc(docSnap.ref, cardUpdatePayload);

  invalidateCache('qrcards');
  invalidateCache(`card_${docSnap.id}`);
  invalidateCache(`card_${cardData.cardCode}`);
  if (cardData.adminUid) {
    invalidateCache(`booked_counts_${cardData.adminUid}`);
    invalidateCache(`booked_reqs_${cardData.adminUid}`);
  }

  // Notifications on Decision (Notify Admin, Customer Contact Person, and Assigned Holder)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site';
  const customDetails = targetAvailment.customRequestDetails || targetAvailment.remarks || 'Custom Request';
  const custEmail = (targetAvailment.contactEmail || cardData.savedContactEmail || '').trim();
  const custName = (targetAvailment.contactPersonName || cardData.savedContactName || 'Customer').trim();
  const custPhone = (targetAvailment.contactNumber || cardData.savedContactPhone || '').trim();

  // Send Decision Email to Customer Contact Person
  if (custEmail) {
    sendCustomRequestNotification({
      recipientEmail: custEmail,
      recipientName: custName,
      recipientType: 'customer',
      actionType: isApproved ? 'approved' : 'rejected',
      cardCode: cardData.cardCode,
      cardTitle: cardData.cardTitle,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      address: targetAvailment.address || cardData.savedAddress,
      customRequestDetails: customDetails,
      appointmentDate: targetAvailment.appointmentDate || (targetAvailment.targetWeek ? `Target Week: ${targetAvailment.targetWeek}` : undefined),
      appointmentTimeSlot: targetAvailment.appointmentTimeSlot,
      remarks: isApproved
        ? 'Your custom service request has been reviewed and approved! Our administrator will schedule the service date shortly.'
        : 'Your custom service request was reviewed and could not be approved at this time.',
      approvalNotes: approvalNotes,
      portalUrl: baseUrl
    }).then((res) => {
      if (res.success) {
        console.log(`[Email Dispatch] Custom request decision email sent to customer (${custEmail})`);
      }
    }).catch((e) => console.warn('Custom request response email to customer failed:', e));
  }

  // Send Decision Email to Assigned Holder / Jobber (if not the one who responded)
  const holderEmail = (cardData.assignedUserEmail || '').trim().toLowerCase();
  const responderEmail = (responder.email || '').trim().toLowerCase();
  if (holderEmail && holderEmail !== responderEmail) {
    sendCustomRequestNotification({
      recipientEmail: holderEmail,
      recipientName: cardData.assignedUserName || 'Assigned Holder',
      recipientType: 'managed_user',
      actionType: isApproved ? 'approved' : 'rejected',
      cardCode: cardData.cardCode,
      cardTitle: cardData.cardTitle,
      customerName: custName,
      customerPhone: custPhone,
      customerEmail: custEmail,
      address: targetAvailment.address || cardData.savedAddress,
      customRequestDetails: customDetails,
      appointmentDate: targetAvailment.appointmentDate || (targetAvailment.targetWeek ? `Target Week: ${targetAvailment.targetWeek}` : undefined),
      appointmentTimeSlot: targetAvailment.appointmentTimeSlot,
      remarks: targetAvailment.remarks,
      approvalNotes: approvalNotes,
      portalUrl: baseUrl
    }).catch((e) => console.warn('Custom request response email to holder failed:', e));
  }

  if (cardData.adminUid) {
    getDoc(doc(db, USERS_COLLECTION, cardData.adminUid))
      .then((adminSnap) => {
        let adminEmail = 'admin@premierlighting.site';
        let adminName = 'Administrator';
        
        if (adminSnap.exists()) {
          const adminData = adminSnap.data() as AdminUserProfile;
          adminEmail = adminData.email || adminEmail;
          adminName = adminData.displayName || adminName;
        }

        // In-App Notification for Admin
        createInAppNotification({
          recipientEmail: adminEmail.toLowerCase(),
          recipientType: 'admin',
          recipientUid: cardData.adminUid,
          title: isApproved ? `✅ Custom Request Approved by ${responder.displayName || 'Jobber'}` : `❌ Custom Request Declined by ${responder.displayName || 'Jobber'}`,
          message: `Custom service request on Pass ${cardData.cardCode} for ${targetAvailment.contactPersonName} was ${isApproved ? 'APPROVED' : 'DECLINED'} by Jobber ${responder.displayName || 'Jobber'}. ${approvalNotes ? `Decision Note: "${approvalNotes}"` : ''}`,
          type: isApproved ? 'custom_request_approved' : 'custom_request_rejected',
          cardCode: cardData.cardCode,
          availmentId: availmentId,
          read: false
        }).catch((e) => console.warn('Admin notification error:', e));

        // Automated Email Notification to Admin
        sendCustomRequestNotification({
          recipientEmail: adminEmail,
          recipientName: adminName,
          recipientType: 'admin',
          actionType: isApproved ? 'approved' : 'rejected',
          cardCode: cardData.cardCode,
          cardTitle: cardData.cardTitle,
          customerName: targetAvailment.contactPersonName,
          customerPhone: targetAvailment.contactNumber,
          address: targetAvailment.address,
          customRequestDetails: customDetails,
          appointmentDate: targetAvailment.appointmentDate || (targetAvailment.targetWeek ? `Target Week: ${targetAvailment.targetWeek}` : undefined),
          appointmentTimeSlot: targetAvailment.appointmentTimeSlot,
          remarks: targetAvailment.remarks,
          approvalNotes: approvalNotes,
          portalUrl: baseUrl
        }).then((res) => {
          if (res.success) {
            console.log(`Custom request decision email successfully sent to Admin (${adminEmail})`);
          }
        }).catch((e) => console.warn('Custom request response email to admin failed:', e));
      })
      .catch((e) => console.warn('Admin fetch failed during custom request response:', e));
  }

  return {
    ...cardData,
    availments: updatedAvailments,
    updatedAt: nowISO
  };
}

/**
 * Get Admin Schedule for a specific month (e.g. "2026-08") with caching & deduplication
 */
export async function getAdminSchedule(
  adminUid: string,
  monthKey: string,
  forceRefresh = false
): Promise<AdminSchedule | null> {
  const docId = `${adminUid}_${monthKey}`;
  const cacheKey = `sched_${docId}`;

  if (!forceRefresh) {
    const cached = getCached<AdminSchedule>(cacheKey, 120000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const docRef = doc(db, SCHEDULES_COLLECTION, docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const sched = { id: snap.id, ...snap.data() } as AdminSchedule;
        setCached(cacheKey, sched);
        return sched;
      }
    } catch (e) {
      console.warn('Error fetching specific admin schedule:', e);
    }
    return null;
  });
}

/**
 * Get all Admin Schedules across all months with caching & deduplication
 */
export async function getAllAdminSchedules(adminUid?: string, forceRefresh = false): Promise<AdminSchedule[]> {
  const cacheKey = `schedules_all_${adminUid || 'all'}`;

  if (!forceRefresh) {
    const cached = getCached<AdminSchedule[]>(cacheKey, 120000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    try {
      const colRef = collection(db, SCHEDULES_COLLECTION);
      const q = adminUid ? query(colRef, where('adminUid', '==', adminUid)) : query(colRef);
      const snap = await getDocs(q);
      const results: AdminSchedule[] = [];
      snap.forEach((d) => {
        const data = d.data() as AdminSchedule;
        results.push({ id: d.id, ...data });
      });
      setCached(cacheKey, results);
      return results;
    } catch (err) {
      console.error('Error fetching admin schedules:', err);
      return [];
    }
  });
}

/**
 * Save or update Admin Schedule for a month
 */
export async function saveAdminSchedule(
  adminUid: string,
  monthKey: string,
  data: {
    enabledWeekdays: string[];
    timeSlots: string[];
    maxBookingsPerSlot?: number;
    maxBookingsPerDay?: number;
    blockedDates?: string[];
  }
): Promise<AdminSchedule> {
  const docId = `${adminUid}_${monthKey}`;
  const docRef = doc(db, SCHEDULES_COLLECTION, docId);

  const schedulePayload: AdminSchedule = {
    adminUid,
    monthKey,
    enabledWeekdays: data.enabledWeekdays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    timeSlots: data.timeSlots || ['09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', '01:00 PM - 02:00 PM', '02:00 PM - 03:00 PM'],
    maxBookingsPerSlot: data.maxBookingsPerSlot ?? 5,
    maxBookingsPerDay: data.maxBookingsPerDay ?? 2,
    blockedDates: data.blockedDates || [],
    updatedAt: new Date().toISOString()
  };

  await setDoc(docRef, schedulePayload, { merge: true });
  invalidateCache('schedules');
  invalidateCache(`sched_${docId}`);
  return schedulePayload;
}

export interface BookedRequestItem {
  cardCode: string;
  cardTitle: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
  availment: ServiceAvailment;
}

/**
 * Get map of booked appointment counts per date (YYYY-MM-DD) for an admin's QR cards (leveraging cached QR cards)
 */
export async function getAdminBookedCountsByDate(adminUid: string, forceRefresh = false): Promise<Record<string, number>> {
  const cacheKey = `booked_counts_${adminUid}`;
  if (!forceRefresh) {
    const cached = getCached<Record<string, number>>(cacheKey, 60000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    const counts: Record<string, number> = {};
    try {
      const adminCards = await getQrCards({ adminUid }, forceRefresh);
      for (const card of adminCards) {
        if (card.availments && card.availments.length > 0) {
          for (const availment of card.availments) {
            if (availment.appointmentDate) {
              const dateKey = availment.appointmentDate;
              counts[dateKey] = (counts[dateKey] || 0) + 1;
            }
          }
        }
      }
      setCached(cacheKey, counts);
    } catch (err) {
      console.error('Error calculating booked counts by date:', err);
    }
    return counts;
  });
}

/**
 * Get map of detailed booked service requests per date (YYYY-MM-DD) for an admin's QR cards (leveraging cached QR cards)
 */
export async function getAdminBookedRequestsByDate(adminUid: string, forceRefresh = false): Promise<Record<string, BookedRequestItem[]>> {
  const cacheKey = `booked_reqs_${adminUid}`;
  if (!forceRefresh) {
    const cached = getCached<Record<string, BookedRequestItem[]>>(cacheKey, 60000);
    if (cached) return cached;
  }

  return deduplicateRequest(cacheKey, async () => {
    const requestsByDate: Record<string, BookedRequestItem[]> = {};
    try {
      const adminCards = await getQrCards({ adminUid }, forceRefresh);
      for (const card of adminCards) {
        if (card.availments && card.availments.length > 0) {
          for (const availment of card.availments) {
            if (availment.appointmentDate) {
              const dateKey = availment.appointmentDate;
              if (!requestsByDate[dateKey]) {
                requestsByDate[dateKey] = [];
              }
              requestsByDate[dateKey].push({
                cardCode: card.cardCode,
                cardTitle: card.cardTitle,
                assignedUserName: card.assignedUserName,
                assignedUserEmail: card.assignedUserEmail,
                availment
              });
            }
          }
        }
      }
      setCached(cacheKey, requestsByDate);
    } catch (err) {
      console.error('Error fetching booked requests by date:', err);
    }
    return requestsByDate;
  });
}

/**
 * Update service request completion status with admin uploaded completion photos
 */
export async function updateServiceRequestCompletion(
  cardCode: string,
  availmentId: string,
  params: {
    status: 'completed' | 'in_progress' | 'pending';
    completionPhotos?: string[];
  }
): Promise<void> {
  if (params.status === 'completed' && (!params.completionPhotos || params.completionPhotos.length === 0)) {
    throw new Error('At least one completion photo must be uploaded by the admin to complete a service request.');
  }

  const collectionRef = collection(db, QR_CARDS_COLLECTION);
  const q = query(collectionRef, where('cardCode', '==', cardCode.trim()), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error(`QR Card with code "${cardCode}" not found.`);
  }

  const docSnap = snap.docs[0];
  const cardData = docSnap.data() as QrCard;
  const availments = cardData.availments || [];

  const compressedCompletionPhotos = await compressPhotosList(params.completionPhotos || []);

  const updatedAvailments = cleanForFirestore(
    availments.map((a) => {
      if (a.id === availmentId) {
        return {
          ...a,
          status: params.status,
          completionPhotos:
            compressedCompletionPhotos.length > 0
              ? compressedCompletionPhotos
              : (a.completionPhotos || []),
          completedAt: params.status === 'completed' ? new Date().toISOString() : (a.completedAt || null)
        };
      }
      return a;
    })
  );

  await updateDoc(
    docSnap.ref,
    cleanForFirestore({
      availments: updatedAvailments,
      updatedAt: new Date().toISOString()
    })
  );

  invalidateCache('qrcards');
  invalidateCache(`card_${docSnap.id}`);
  invalidateCache(`card_${cardCode}`);
  if (cardData.adminUid) {
    invalidateCache(`booked_counts_${cardData.adminUid}`);
    invalidateCache(`booked_reqs_${cardData.adminUid}`);
  }
}

/**
 * Update the scheduled date / time slot for an availment (e.g. scheduling a custom request after user approval)
 */
export async function updateAvailmentScheduleDate(
  cardCode: string,
  availmentId: string,
  appointmentDate: string,
  appointmentTimeSlot?: string,
  adminEmail?: string
): Promise<QrCard> {
  const collectionRef = collection(db, QR_CARDS_COLLECTION);
  const q = query(collectionRef, where('cardCode', '==', cardCode.trim()), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error(`QR Card with code "${cardCode}" not found.`);
  }

  const docSnap = snap.docs[0];
  const cardData = docSnap.data() as QrCard;
  const availments = cardData.availments || [];

  let scheduledAvailment: ServiceAvailment | undefined;

  const updatedAvailments = cleanForFirestore(
    availments.map((a) => {
      if (a.id === availmentId) {
        scheduledAvailment = {
          ...a,
          appointmentDate: appointmentDate.trim(),
          appointmentTimeSlot: appointmentTimeSlot || a.appointmentTimeSlot || '',
          scheduledByAdminAt: new Date().toISOString(),
          scheduledByAdminEmail: adminEmail || 'admin'
        };
        return scheduledAvailment;
      }
      return a;
    })
  );

  const updatedCardPayload = cleanForFirestore({
    availments: updatedAvailments,
    updatedAt: new Date().toISOString()
  });

  await updateDoc(docSnap.ref, updatedCardPayload);

  invalidateCache('qrcards');
  invalidateCache(`card_${docSnap.id}`);
  invalidateCache(`card_${cardCode}`);
  if (cardData.adminUid) {
    invalidateCache(`booked_counts_${cardData.adminUid}`);
    invalidateCache(`booked_reqs_${cardData.adminUid}`);
  }

  // Send In-App & Email notification to assigned Jobber & Customer that service has been scheduled on a date
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://premierlighting.site';
  const customDetails = scheduledAvailment ? (scheduledAvailment.customRequestDetails || scheduledAvailment.remarks || (scheduledAvailment.requestedServices || []).join(', ') || 'Service Request') : 'Service';

  if (cardData.assignedUserEmail && scheduledAvailment) {
    createInAppNotification({
      recipientEmail: cardData.assignedUserEmail.toLowerCase(),
      recipientType: 'managed_user',
      recipientUid: cardData.assignedUserId,
      title: `📅 Service Appointment Scheduled: ${appointmentDate}`,
      message: `Admin has scheduled service for Pass ${cardData.cardCode} on ${appointmentDate}${appointmentTimeSlot ? ` (${appointmentTimeSlot})` : ''} for customer ${scheduledAvailment.contactPersonName}.`,
      type: 'custom_request_approved',
      cardCode: cardData.cardCode,
      availmentId: availmentId,
      read: false
    }).catch((e) => console.warn('In-app notif error to jobber:', e));

    sendCustomRequestNotification({
      recipientEmail: cardData.assignedUserEmail,
      recipientName: cardData.assignedUserName || 'Service Jobber',
      recipientType: 'managed_user',
      actionType: 'scheduled',
      cardCode: cardData.cardCode,
      cardTitle: cardData.cardTitle,
      customerName: scheduledAvailment.contactPersonName,
      customerPhone: scheduledAvailment.contactNumber,
      customerEmail: scheduledAvailment.contactEmail,
      address: scheduledAvailment.address,
      customRequestDetails: customDetails,
      appointmentDate: appointmentDate,
      appointmentTimeSlot: appointmentTimeSlot,
      remarks: `Admin has scheduled this appointment for ${appointmentDate}`,
      portalUrl: baseUrl
    }).catch((e) => console.warn('Email to jobber on schedule failed:', e));
  }

  // Send schedule confirmation email to Customer (entered email on card or saved profile)
  const customerEmail = (scheduledAvailment?.contactEmail || cardData.savedContactEmail || '').trim();
  const customerName = (scheduledAvailment?.contactPersonName || cardData.savedContactName || 'Valued Customer').trim();
  const customerPhone = (scheduledAvailment?.contactNumber || cardData.savedContactPhone || '').trim();

  if (customerEmail) {
    sendCustomRequestNotification({
      recipientEmail: customerEmail,
      recipientName: customerName,
      recipientType: 'customer',
      actionType: 'scheduled',
      cardCode: cardData.cardCode,
      cardTitle: cardData.cardTitle,
      customerName: customerName,
      customerPhone: customerPhone,
      customerEmail: customerEmail,
      address: scheduledAvailment?.address || cardData.savedAddress,
      customRequestDetails: customDetails,
      appointmentDate: appointmentDate,
      appointmentTimeSlot: appointmentTimeSlot,
      remarks: `Your service appointment has been confirmed and scheduled for ${appointmentDate}${appointmentTimeSlot ? ` (${appointmentTimeSlot})` : ''}. Our service team will arrive at your address during this window.`,
      portalUrl: baseUrl
    }).then((res) => {
      if (res.success) {
        console.log(`[Email Dispatch] Schedule confirmation email dispatched to customer (${customerEmail}) for Pass ${cardData.cardCode}`);
      }
    }).catch((e) => console.warn('Email to customer on schedule failed:', e));
  }

  return {
    ...cardData,
    availments: updatedAvailments,
    updatedAt: new Date().toISOString()
  };
}



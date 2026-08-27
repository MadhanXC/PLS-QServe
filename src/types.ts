export type AdminRole = 'admin';
export type AccountStatus = 'active' | 'suspended';

export interface AdminUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt?: string;
}

export type AccessLevel = 'Standard User' | 'Read Only' | 'Operator' | 'Manager';
export type ManagedUserStatus = 'active' | 'inactive' | 'suspended';
export type ManagedUserAccountType = 'internal_staff' | 'client';

export interface ManagedUser {
  id: string;
  adminUid: string;
  adminEmail: string;
  displayName: string;
  email: string;
  accountType?: ManagedUserAccountType;
  companyName?: string;
  password?: string; // Legacy field or placeholder
  passwordHash?: string; // Cryptographically hashed password (sha256:salt:hash)
  passwordResetToken?: string; // Secure token for initial password setup / reset
  passwordResetExpires?: string; // ISO expiration string for token (e.g. 48h)
  passwordSetAt?: string; // When the user set or changed their password
  department: string;
  accessLevel: AccessLevel;
  status: ManagedUserStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AuthMode = 'login' | 'register' | 'forgot-password';

export type QrCardStatus = 'active' | 'used' | 'expired' | 'revoked';

export interface UsAddress {
  streetAddress: string;
  aptSuite?: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface ServiceAvailment {
  id: string;
  requestedServices: string[];
  contactPersonName: string;
  contactNumber: string;
  contactEmail?: string; // Requester email address
  address: UsAddress;
  appointmentDate?: string; // YYYY-MM-DD (set by admin for standard/custom requests)
  appointmentTimeSlot?: string; // e.g. "09:00 AM - 10:00 AM"
  targetWeek?: string; // e.g. "Week of Aug 24, 2026 – Aug 28, 2026"
  scheduledByAdminAt?: string;
  scheduledByAdminEmail?: string;
  photos?: string[]; // Base64 data URLs or image URLs
  completionPhotos?: string[]; // Photos uploaded by admin upon completing service
  completedAt?: string;
  remarks?: string; // Optional remarks or special requests
  timestamp: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'rejected';
  
  // Custom Request Extensions
  isCustomRequest?: boolean;
  customRequestDetails?: string;
  approvalStatus?: 'pending_approval' | 'approved' | 'rejected';
  approvalNotes?: string;
  approvedAt?: string;
  rejectedAt?: string;
  managedUserId?: string;
  managedUserName?: string;
  managedUserEmail?: string;
}

export interface AdminSchedule {
  id?: string;
  adminUid: string;
  monthKey: string; // YYYY-MM format, e.g., "2026-08"
  enabledWeekdays: string[]; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  timeSlots: string[]; // e.g. ['09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM', ...]
  maxBookingsPerSlot?: number;
  maxBookingsPerDay?: number; // max total service calls allowed per day (defaults to 2)
  blockedDates?: string[]; // YYYY-MM-DD format for excluded weekday dates
  updatedAt: string;
}

export interface QrCard {
  id: string;
  adminUid: string;
  cardTitle: string;
  cardCode: string;
  assignedUserId?: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
  services: string[];
  allowCustomRequest?: boolean; // Controls whether this QR card allows custom service requests
  customRequestInstructions?: string; // Optional guidance for custom requests
  validUntil: string;
  firstAvailedDate?: string; // Date when a service was first availed (validity becomes 1 year from this date)
  status: QrCardStatus;
  qrData: string;
  verificationUrl: string;
  savedAddress?: UsAddress;
  savedContactName?: string;
  savedContactEmail?: string;
  savedContactPhone?: string;
  availments?: ServiceAvailment[];
  createdAt: string;
  updatedAt: string;
}

export interface InAppNotification {
  id: string;
  recipientUid?: string; // Admin UID or Managed User ID
  recipientEmail: string;
  recipientType: 'admin' | 'managed_user';
  title: string;
  message: string;
  type: 'service_request_created' | 'custom_request_created' | 'custom_request_approved' | 'custom_request_rejected' | 'service_completed';
  cardCode: string;
  availmentId: string;
  read: boolean;
  createdAt: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

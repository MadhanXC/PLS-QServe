import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import {
  syncUserProfile,
  getManagedUsers,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  authenticateManagedUser,
  createBulkQrCards,
  getQrCards,
  updateQrCardStatus,
  restoreQrCardService,
  updateQrCardDetails,
  deleteQrCard,
  deleteBulkQrCards,
  subscribeToQrCards,
  subscribeToManagedUsers
} from './lib/userService';
import { deduplicateList } from './lib/cacheService';
import { AdminUserProfile, AuthMode, ToastMessage, ManagedUser, AccessLevel, ManagedUserStatus, QrCard, QrCardStatus, InAppNotification } from './types';

// Components
import { LoginForm } from './components/LoginForm';
import { RegisterForm } from './components/RegisterForm';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { UsersDirectoryView } from './components/UsersDirectoryView';
import { ManagedUsersView } from './components/ManagedUsersView';
import { QrCardGeneratorView } from './components/QrCardGeneratorView';
import { ManagedUserPortal } from './components/ManagedUserPortal';
import { ProfileView } from './components/ProfileView';
import { PublicCardVerifier } from './components/PublicCardVerifier';
import { AdminScheduleView } from './components/AdminScheduleView';
import { SetPasswordView } from './components/SetPasswordView';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

function parseResetTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Check window.location.search (?token=... or ?resetToken=...)
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('token') || searchParams.get('resetToken');
  if (fromSearch) return fromSearch.trim();

  // 2. Check window.location.hash (#/?token=... or #token=...)
  if (window.location.hash) {
    const hashStr = window.location.hash.substring(1);
    const queryIdx = hashStr.indexOf('?');
    if (queryIdx !== -1) {
      const hashParams = new URLSearchParams(hashStr.substring(queryIdx));
      const fromHash = hashParams.get('token') || hashParams.get('resetToken');
      if (fromHash) return fromHash.trim();
    }
  }

  return null;
}

function parseCardIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Check window.location.search (?cardId=... or ?verify=... or ?cardCode=...)
  const searchParams = new URLSearchParams(window.location.search);
  const fromSearch = searchParams.get('cardId') || searchParams.get('verify') || searchParams.get('cardCode');
  if (fromSearch) return fromSearch.trim();

  // 2. Check window.location.hash (#/?cardId=... or #cardId=...)
  if (window.location.hash) {
    const hashStr = window.location.hash.substring(1);
    const queryIdx = hashStr.indexOf('?');
    if (queryIdx !== -1) {
      const hashParams = new URLSearchParams(hashStr.substring(queryIdx));
      const fromHash = hashParams.get('cardId') || hashParams.get('verify') || hashParams.get('cardCode');
      if (fromHash) return fromHash.trim();
    }
  }

  return null;
}

const MANAGED_SESSION_KEY = 'pl_managed_user_session';

function getStoredManagedUser(): ManagedUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(MANAGED_SESSION_KEY);
    if (!stored) return null;

    const user = JSON.parse(stored) as ManagedUser;
    return user.id && user.email && user.status ? user : null;
  } catch {
    window.localStorage.removeItem(MANAGED_SESSION_KEY);
    return null;
  }
}

function getManagedSessionData(user: ManagedUser): ManagedUser {
  const {
    password,
    passwordHash,
    passwordResetToken,
    passwordResetExpires,
    ...sessionData
  } = user;
  return sessionData;
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Check for card verification query params
  const [verifyCardId, setVerifyCardId] = useState<string | null>(() => parseCardIdFromUrl());

  // Check for reset password token in query params
  const [resetToken, setResetToken] = useState<string | null>(() => parseResetTokenFromUrl());

  // Forgot password parameters
  const [forgotPassState, setForgotPassState] = useState<{
    accountType?: 'admin' | 'managed_user';
    email?: string;
  }>({});

  useEffect(() => {
    const handleUrlChange = () => {
      const foundCard = parseCardIdFromUrl();
      if (foundCard) {
        setVerifyCardId(foundCard);
      }
      const foundToken = parseResetTokenFromUrl();
      if (foundToken) {
        setResetToken(foundToken);
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Managed End User Session
  const [managedUserSession, setManagedUserSession] = useState<ManagedUser | null>(getStoredManagedUser);

  const updateManagedUserSession = (user: ManagedUser | null) => {
    if (typeof window !== 'undefined') {
      if (user) {
        window.localStorage.setItem(MANAGED_SESSION_KEY, JSON.stringify(getManagedSessionData(user)));
      } else {
        window.localStorage.removeItem(MANAGED_SESSION_KEY);
      }
    }
    setManagedUserSession(user);
  };

  // Auth & View modes
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'managed-users' | 'qr-cards' | 'schedule' | 'profile'>('dashboard');
  const [notificationTarget, setNotificationTarget] = useState<InAppNotification | null>(null);

  // Firestore Managed End Users, and QR Cards lists
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [qrCards, setQrCards] = useState<QrCard[]>([]);

  // Toast feedback state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 5);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load managed users created by current admin
  const loadManagedUsersList = async (currentUid?: string) => {
    const targetUid = currentUid || authUser?.uid;
    if (!targetUid) return;
    const mus = await getManagedUsers(targetUid);
    setManagedUsers(deduplicateList(mus));
  };

  // Load QR Cards created by current admin
  const loadQrCardsList = async (currentUid?: string) => {
    const targetUid = currentUid || authUser?.uid;
    if (!targetUid) return;
    const cards = await getQrCards({ adminUid: targetUid });
    setQrCards(deduplicateList(cards));
  };

  // Firebase auth state listener with real-time Firestore sync
  useEffect(() => {
    let unsubQrCards: (() => void) | null = null;
    let unsubManagedUsers: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (unsubQrCards) {
        unsubQrCards();
        unsubQrCards = null;
      }
      if (unsubManagedUsers) {
        unsubManagedUsers();
        unsubManagedUsers = null;
      }

      if (user) {
        try {
          const syncedProfile = await syncUserProfile(
            user.uid,
            user.email || '',
            user.displayName || undefined
          );
          setProfile(syncedProfile);

          // Initial cached load
          loadManagedUsersList(user.uid);
          loadQrCardsList(user.uid);

          // Real-time live subscriptions so ANY jobber approval or card update immediately reflects on admin panel
          unsubQrCards = subscribeToQrCards(user.uid, (cards) => {
            setQrCards(deduplicateList(cards));
          });
          unsubManagedUsers = subscribeToManagedUsers(user.uid, (mus) => {
            setManagedUsers(deduplicateList(mus));
          });
        } catch (err) {
          console.error('Profile sync error:', err);
        }
      } else {
        setProfile(null);
        setManagedUsers([]);
        setQrCards([]);
      }
      setAuthLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubQrCards) unsubQrCards();
      if (unsubManagedUsers) unsubManagedUsers();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      addToast('info', 'You have been signed out.');
      setAuthMode('login');
    } catch (err: any) {
      console.error('Logout error:', err);
      addToast('error', 'Error signing out.');
    }
  };

  // Managed Users Handlers
  const handleCreateManagedUser = async (data: {
    displayName: string;
    email: string;
    password: string;
    department: string;
    accessLevel: AccessLevel;
    status: ManagedUserStatus;
    accountType: 'internal_staff' | 'client';
    companyName: string;
    notes?: string;
  }) => {
    if (!authUser) return;
    const newManagedUser = await createManagedUser(authUser.uid, authUser.email || '', data);
    setManagedUsers((prev) => deduplicateList([newManagedUser, ...prev]));
  };

  const handleUpdateManagedUser = async (
    id: string,
    data: Partial<Omit<ManagedUser, 'id' | 'adminUid' | 'createdAt'>>
  ) => {
    if (!authUser) return;
    await updateManagedUser(id, data);
    setManagedUsers((prev) =>
      deduplicateList(prev.map((u) => (u.id === id ? { ...u, ...data, updatedAt: new Date().toISOString() } : u)))
    );
  };

  const handleDeleteManagedUser = async (id: string) => {
    if (!authUser) return;
    try {
      await deleteManagedUser(id);
      setManagedUsers((prev) => prev.filter((u) => u.id !== id));
      addToast('success', 'Managed user deleted successfully.');
    } catch (err: any) {
      addToast('error', 'Failed to delete managed user.');
    }
  };

  // QR Cards Handlers
  const handleCreateBulkCards = async (params: {
    cardTitle: string;
    services: string[];
    validUntil: string;
    targetUsers: Array<{ id?: string; name?: string; email?: string }>;
    quantityPerUser?: number;
  }) => {
    if (!authUser) return;
    const createdCards = await createBulkQrCards(authUser.uid, params);
    setQrCards((prev) => deduplicateList([...createdCards, ...prev]));
  };

  const handleUpdateQrCardStatus = async (id: string, status: QrCardStatus) => {
    if (!authUser) return;
    await updateQrCardStatus(id, status);
    setQrCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c))
    );
    addToast('success', `Card status updated to ${status}.`);
  };

  const handleRestoreQrCardService = async (cardCode: string, availmentId: string, serviceName: string): Promise<QrCard> => {
    const updatedCard = await restoreQrCardService(cardCode, availmentId, serviceName);
    setQrCards((prev) => prev.map((card) => card.id === updatedCard.id ? updatedCard : card));
    return updatedCard;
  };

  const handleUpdateQrCardDetails = async (
    id: string,
    data: Partial<Pick<QrCard, 'cardTitle' | 'assignedUserId' | 'assignedUserName' | 'assignedUserEmail' | 'services' | 'validUntil' | 'status'>>
  ) => {
    if (!authUser) return;
    await updateQrCardDetails(id, data);
    setQrCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c))
    );
    addToast('success', 'QR Card details updated successfully.');
  };

  const handleDeleteQrCard = async (id: string) => {
    if (!authUser) return;
    try {
      await deleteQrCard(id);
      setQrCards((prev) => prev.filter((c) => c.id !== id));
      addToast('success', 'QR Card deleted.');
    } catch (err: any) {
      addToast('error', 'Failed to delete QR card.');
    }
  };

  const handleDeleteBulkQrCards = async (ids: string[]) => {
    if (!authUser) return;
    try {
      await deleteBulkQrCards(ids);
      const idSet = new Set(ids);
      setQrCards((prev) => prev.filter((c) => !idSet.has(c.id)));
      addToast('success', `Successfully deleted ${ids.length} QR cards.`);
    } catch (err: any) {
      addToast('error', 'Failed to delete selected QR cards.');
    }
  };

  const handleUpdateCardAvailment = (cardCode: string, availmentId: string, status: string, photos: string[]) => {
    setQrCards((prev) =>
      prev.map((c) => {
        if (c.cardCode === cardCode && c.availments) {
          return {
            ...c,
            availments: c.availments.map((a) =>
              a.id === availmentId ? { ...a, status: status as any, completionPhotos: photos } : a
            )
          };
        }
        return c;
      })
    );
  };

  const handleScheduleAvailment = (cardCode: string, availmentId: string, appointmentDate: string, appointmentTimeSlot?: string) => {
    setQrCards((prev) =>
      prev.map((c) => {
        if (c.cardCode === cardCode && c.availments) {
          return {
            ...c,
            availments: c.availments.map((a) =>
              a.id === availmentId ? { ...a, appointmentDate, appointmentTimeSlot: appointmentTimeSlot || a.appointmentTimeSlot } : a
            )
          };
        }
        return c;
      })
    );
  };

  const handleManagedUserLogin = async (email: string, pass: string) => {
    const user = await authenticateManagedUser(email, pass);
    updateManagedUserSession(user);
  };

  const handleManagedUserLogout = () => {
    updateManagedUserSession(null);
    addToast('info', 'Signed out from end user portal.');
  };

  // Render Loading spinner during initial auth resolution
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-slate-300 tracking-wider uppercase">Loading Portal...</p>
      </div>
    );
  }

  // Public Password Reset / Setup View via Email Token
  if (resetToken) {
    return (
      <ErrorBoundary
        fallbackTitle="Error Loading Password Setup Screen"
        onReset={() => setResetToken(null)}
      >
        <Toast toasts={toasts} onDismiss={removeToast} />
        <SetPasswordView
          token={resetToken}
          onSuccess={(updatedUser) => {
            setResetToken(null);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', window.location.pathname);
            }
            updateManagedUserSession(updatedUser);
            addToast('success', `Welcome, ${updatedUser.displayName}! Your password is now active.`);
          }}
          onCancel={() => {
            setResetToken(null);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', window.location.pathname);
            }
            setAuthMode('login');
          }}
        />
      </ErrorBoundary>
    );
  }

  // Public QR Card Verification Link / Scan Screen
  if (verifyCardId) {
    return (
      <ErrorBoundary
        fallbackTitle="Error Loading QR Verification Screen"
        onReset={() => setVerifyCardId(null)}
      >
        <Toast toasts={toasts} onDismiss={removeToast} />
        <PublicCardVerifier
          cardId={verifyCardId}
          onClose={() => {
            setVerifyCardId(null);
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
          onSuccessToast={(msg) => addToast('success', msg)}
        />
      </ErrorBoundary>
    );
  }

  // Active Managed End-User Session
  if (managedUserSession) {
    return (
      <>
        <Toast toasts={toasts} onDismiss={removeToast} />
        <ManagedUserPortal
          user={managedUserSession}
          onLogout={handleManagedUserLogout}
          onVerifyCard={(cardNum) => setVerifyCardId(cardNum)}
          onSuccess={(msg) => addToast('success', msg)}
          onCardUpdated={() => {
            if (authUser) {
              loadQrCardsList(authUser.uid);
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Toast Alert overlay */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {!authUser ? (
        /* Unauthenticated Auth Screen */
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-900/5 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
          {authMode === 'login' && (
            <LoginForm
              onSwitchMode={(mode, accountType, email) => {
                setForgotPassState({ accountType, email });
                setAuthMode(mode);
              }}
              onManagedUserLogin={handleManagedUserLogin}
              onVerifyCard={(cardNum) => setVerifyCardId(cardNum)}
              onSuccessMessage={(msg) => addToast('success', msg)}
              onErrorMessage={(msg) => addToast('error', msg)}
            />
          )}

          {authMode === 'register' && (
            <RegisterForm
              onSwitchMode={(mode) => setAuthMode(mode)}
              onSuccessMessage={(msg) => {
                addToast('success', msg);
                setAuthMode('login');
              }}
              onErrorMessage={(msg) => addToast('error', msg)}
            />
          )}

          {authMode === 'forgot-password' && (
            <ForgotPasswordModal
              initialAccountType={forgotPassState.accountType}
              initialEmail={forgotPassState.email}
              onBackToLogin={() => setAuthMode('login')}
              onSuccessMessage={(msg) => addToast('success', msg)}
              onErrorMessage={(msg) => addToast('error', msg)}
            />
          )}
        </div>
      ) : (
        /* Authenticated Admin Dashboard Portal */
        <div className="flex-1 flex flex-col">
          <Navbar
            authUser={authUser}
            profile={profile}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
            onLogout={handleLogout}
            onOpenNotification={(notification) => {
              setNotificationTarget(notification);
              setActiveTab('schedule');
            }}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {activeTab === 'dashboard' && (
              <DashboardView
                authUser={authUser}
                profile={profile}
                qrCards={qrCards}
                managedUsersCount={managedUsers.length}
                onNavigateManagedUsers={() => setActiveTab('managed-users')}
                onNavigateQrCards={() => setActiveTab('qr-cards')}
                onNavigateSchedule={() => setActiveTab('schedule')}
                onNavigateProfile={() => setActiveTab('profile')}
                onScheduleAvailment={handleScheduleAvailment}
                onSuccessToast={(msg) => addToast('success', msg)}
              />
            )}

            {activeTab === 'managed-users' && (
              <ManagedUsersView
                managedUsers={managedUsers}
                currentAdminEmail={authUser.email || ''}
                onRefresh={() => loadManagedUsersList(authUser.uid)}
                onCreateUser={handleCreateManagedUser}
                onUpdateUser={handleUpdateManagedUser}
                onDeleteUser={handleDeleteManagedUser}
                onSuccess={(msg) => addToast('success', msg)}
                onError={(msg) => addToast('error', msg)}
              />
            )}

            {activeTab === 'qr-cards' && (
              <QrCardGeneratorView
                qrCards={qrCards}
                managedUsers={managedUsers}
                currentAdminUid={authUser.uid}
                profile={profile}
                onCreateBulk={handleCreateBulkCards}
                onUpdateStatus={handleUpdateQrCardStatus}
                onRestoreService={handleRestoreQrCardService}
                onUpdateDetails={handleUpdateQrCardDetails}
                onDeleteCard={handleDeleteQrCard}
                onDeleteBulkCards={handleDeleteBulkQrCards}
                onSuccess={(msg) => addToast('success', msg)}
                onError={(msg) => addToast('error', msg)}
              />
            )}

            {activeTab === 'schedule' && (
              <AdminScheduleView
                currentAdminUid={authUser.uid}
                qrCards={qrCards}
                onUpdateCardAvailment={handleUpdateCardAvailment}
                onScheduleAvailment={handleScheduleAvailment}
                onSuccess={(msg) => addToast('success', msg)}
                onError={(msg) => addToast('error', msg)}
                notificationTarget={notificationTarget}
                onNotificationTargetHandled={() => setNotificationTarget(null)}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                authUser={authUser}
                profile={profile}
                onRefreshProfile={async () => {
                  if (authUser) {
                    const p = await syncUserProfile(authUser.uid, authUser.email || '');
                    setProfile(p);
                  }
                }}
                onLogout={handleLogout}
                onSuccessMessage={(msg) => addToast('success', msg)}
                onErrorMessage={(msg) => addToast('error', msg)}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}


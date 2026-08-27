import React, { useEffect, useState } from 'react';
import { ManagedUser, QrCard, ServiceAvailment, InAppNotification } from '../types';
import {
  getQrCards,
  updateManagedUser,
  respondToCustomRequest,
  getInAppNotifications,
  markAllInAppNotificationsAsRead,
  markInAppNotificationAsRead,
  subscribeToUserQrCards,
  subscribeToInAppNotifications
} from '../lib/userService';
import { hashPassword, verifyPassword } from '../lib/cryptoUtils';
import { sendPasswordEmail } from '../lib/emailService';
import { getCardVerificationUrl } from '../lib/appUrl';
import { QrCodeCanvas } from './QrCodeCanvas';
import { PaginationControls } from './PaginationControls';
import {
  UserCheck,
  Building2,
  KeyRound,
  Mail,
  ShieldAlert,
  LogOut,
  Calendar,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Briefcase,
  FileText,
  QrCode,
  Sparkles,
  MapPin,
  Phone,
  Clock,
  User,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
  X,
  ArrowRight,
  Info,
  Sun,
  Moon,
  ShieldCheck,
  Send,
  Bell,
  ThumbsUp,
  ThumbsDown,
  AlertCircle
} from 'lucide-react';

interface ManagedUserPortalProps {
  user: ManagedUser;
  onLogout: () => void;
  onSuccess: (msg: string) => void;
  onVerifyCard?: (cardCode: string) => void;
  onCardUpdated?: () => void;
}

const USER_PASSES_PAGE_SIZE = 10;

export const ManagedUserPortal: React.FC<ManagedUserPortalProps> = ({
  user,
  onLogout,
  onSuccess,
  onVerifyCard,
  onCardUpdated
}) => {
  const [currentUser, setCurrentUser] = useState<ManagedUser>(user);
  const [userQrCards, setUserQrCards] = useState<QrCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCardHistory, setExpandedCardHistory] = useState<Record<string, boolean>>({});
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [cardCategoryTab, setCardCategoryTab] = useState<'all' | 'not_used' | 'used' | 'custom_requests'>('all');
  const [portalViewMode, setPortalViewMode] = useState<'cards' | 'list'>('list');
  const [portalSection, setPortalSection] = useState<'credentials' | 'organization'>('credentials');
  const [selectedPassId, setSelectedPassId] = useState<string | null>(null);
  const [passesCurrentPage, setPassesCurrentPage] = useState<number>(1);
  const [copied, setCopied] = useState(false);

  // In-App Notifications State
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [showNotifsDropdown, setShowNotifsDropdown] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showNotifsDropdown) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifsDropdown]);

  // Custom Request Response Modal / State
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    action: 'accept' | 'reject';
    cardCode: string;
    availmentId: string;
    customerName: string;
    details: string;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Selected Custom Request Inspection Modal (for list view click & detailed review)
  const [selectedCustomDetailModal, setSelectedCustomDetailModal] = useState<{
    card: QrCard;
    availment: ServiceAvailment;
  } | null>(null);

  const handleCardCategoryTabChange = (tab: 'all' | 'not_used' | 'used' | 'custom_requests') => {
    setCardCategoryTab(tab);
    setSelectedPassId(null);
    setPassesCurrentPage(1);
  };

  // Change Password Modal State
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showModalPass, setShowModalPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [changePassError, setChangePassError] = useState<string | null>(null);

  const handleCopyCredentials = () => {
    const text = `Name: ${currentUser.displayName}\nEmail: ${currentUser.email}\nDepartment: ${currentUser.department}\nAccess Level: ${currentUser.accessLevel}\nPassword Security: SHA-256 Hashed`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    onSuccess('Account details copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchCards = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoadingCards(true);

    try {
      const cards = await getQrCards({ userEmail: currentUser.email });
      setUserQrCards(cards);
      // Auto-expand history for cards that have availments
      const historyMap: Record<string, boolean> = {};
      cards.forEach((c) => {
        if (c.availments && c.availments.length > 0) {
          historyMap[c.id] = true;
        }
      });
      setExpandedCardHistory((prev) => ({ ...historyMap, ...prev }));
    } catch (err) {
      console.error('Error fetching user QR cards:', err);
    } finally {
      setLoadingCards(false);
      setRefreshing(false);
    }
  };

  const fetchNotifications = async () => {
    setLoadingNotifs(true);
    try {
      const notifs = await getInAppNotifications(currentUser.email, true);
      setNotifications(notifs);
    } catch (e) {
      console.warn('Error fetching notifications:', e);
    } finally {
      setLoadingNotifs(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await markInAppNotificationAsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (e) {
      console.warn('Error marking notification as read:', e);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await markAllInAppNotificationsAsRead(notifications);
      setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
    } catch (e) {
      console.warn('Error marking all notifications as read:', e);
    }
  };

  const handleOpenNotification = async (notification: InAppNotification) => {
    await handleMarkNotificationRead(notification.id);
    const card = userQrCards.find((item) => item.cardCode === notification.cardCode);
    if (!card) return;

    setCardCategoryTab('all');
    setPortalViewMode('cards');
    setSelectedPassId(card.id);
    setExpandedCardHistory((current) => ({ ...current, [card.id]: true }));
    if (notification.type === 'custom_request_created' || notification.type === 'custom_request_approved' || notification.type === 'custom_request_rejected') {
      const availment = card.availments?.find((item) => item.id === notification.availmentId);
      if (availment) setSelectedCustomDetailModal({ card, availment });
    }
  };

  const handleOpenActionModal = (
    action: 'accept' | 'reject',
    cardCode: string,
    availmentId: string,
    customerName: string,
    details: string
  ) => {
    setActionModal({
      isOpen: true,
      action,
      cardCode,
      availmentId,
      customerName,
      details
    });
    setActionNotes('');
  };

  const handleExecuteActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    setActionSubmitting(true);
    try {
      await respondToCustomRequest(
        actionModal.cardCode,
        actionModal.availmentId,
        actionModal.action,
        {
          id: currentUser.id,
          email: currentUser.email,
          displayName: currentUser.displayName
        },
        actionNotes.trim()
      );

      const msg =
        actionModal.action === 'accept'
          ? `✓ Custom service request accepted! Customer and administrator have been notified by email and schedule updated.`
          : `Custom service request declined. Notice dispatched.`;

      onSuccess(msg);
      setActionModal(null);
      onCardUpdated?.();
      await fetchCards(true);
      await fetchNotifications();
    } catch (err: any) {
      alert(err.message || 'Failed to respond to custom request.');
    } finally {
      setActionSubmitting(false);
    }
  };

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    fetchCards();
    // Live real-time sync for Jobber's QR cards and notifications
    const unsubCards = subscribeToUserQrCards(currentUser.email, (cards) => {
      setUserQrCards(cards);
      setLoadingCards(false);
      const historyMap: Record<string, boolean> = {};
      cards.forEach((c) => {
        if (c.availments && c.availments.length > 0) {
          historyMap[c.id] = true;
        }
      });
      setExpandedCardHistory((prev) => ({ ...historyMap, ...prev }));
    });

    const unsubNotifs = subscribeToInAppNotifications(currentUser.email, (notifs) => {
      setNotifications(notifs);
    });

    return () => {
      unsubCards();
      unsubNotifs();
    };
  }, [currentUser.email]);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError(null);

    if (newPasswordInput.length < 6) {
      setChangePassError('New password must be at least 6 characters.');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setChangePassError('New passwords do not match.');
      return;
    }

    setChangingPass(true);
    try {
      // Verify old password
      const isOldValid = await verifyPassword(
        oldPasswordInput,
        currentUser.passwordHash || currentUser.password
      );
      if (!isOldValid) {
        throw new Error('Current password is incorrect.');
      }

      // Hash new password
      const newHash = await hashPassword(newPasswordInput.trim());
      const nowISO = new Date().toISOString();

      await updateManagedUser(currentUser.id, {
        passwordHash: newHash,
        password: '••••••••'
      });

      setCurrentUser((prev) => ({
        ...prev,
        passwordHash: newHash,
        password: '••••••••',
        passwordSetAt: nowISO
      }));

      // Send confirmation email
      try {
        await sendPasswordEmail({
          email: currentUser.email,
          displayName: currentUser.displayName,
          resetLink: window.location.origin,
          type: 'password_changed'
        });
      } catch (e) {
        console.warn('Email notice error:', e);
      }

      setIsChangePassModalOpen(false);
      setOldPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      onSuccess('Password changed successfully! Stored with SHA-256 cryptographic hashing.');
    } catch (err: any) {
      setChangePassError(err.message || 'Failed to change password.');
    } finally {
      setChangingPass(false);
    }
  };

  const toggleHistoryExpand = (cardId: string) => {
    setExpandedCardHistory((prev) => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Helper to compute set of availed service names for a card
  const getAvailedServicesSet = (card: QrCard) => {
    const set = new Set<string>();
    if (card.availments) {
      for (const a of card.availments) {
        if (a.isCustomRequest) continue;
        if (a.requestedServices && Array.isArray(a.requestedServices)) {
          for (const s of a.requestedServices) {
            if (s) set.add(s.trim());
          }
        }
      }
    }
    return set;
  };

  const getCustomRequestCount = (card: QrCard) =>
    card.availments?.filter((availment) => availment.isCustomRequest).length || 0;

  // Zero-cost client-side memoization for card categories (0 extra Firebase requests)
  const { unusedCards, usedCards, customReqCards, pendingApprovalsCount } = React.useMemo(() => {
    const unused: QrCard[] = [];
    const used: QrCard[] = [];
    const custom: QrCard[] = [];
    let pendingCount = 0;

    for (const card of userQrCards) {
      const set = getAvailedServicesSet(card);
      const hasAvailments = (card.availments && card.availments.length > 0) || set.size > 0;
      if (hasAvailments) {
        used.push(card);
      } else {
        unused.push(card);
      }

      // Check for custom requests
      const hasCustom = card.availments?.some((a) => a.isCustomRequest);
      if (hasCustom) {
        custom.push(card);
      }

      // Count pending custom requests
      card.availments?.forEach((a) => {
        if (a.isCustomRequest && (!a.approvalStatus || a.approvalStatus === 'pending_approval')) {
          pendingCount++;
        }
      });
    }

    return { unusedCards: unused, usedCards: used, customReqCards: custom, pendingApprovalsCount: pendingCount };
  }, [userQrCards]);

  // Extract all individual custom requests across all assigned cards
  const allUserCustomRequests = React.useMemo(() => {
    const list: {
      card: QrCard;
      availment: ServiceAvailment;
    }[] = [];

    for (const card of userQrCards) {
      if (card.availments) {
        for (const a of card.availments) {
          if (a.isCustomRequest) {
            list.push({ card, availment: a });
          }
        }
      }
    }
    return list.sort((a, b) => new Date(b.availment.timestamp).getTime() - new Date(a.availment.timestamp).getTime());
  }, [userQrCards]);

  const unreadNotificationsCount = React.useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Filtered list based on selected category tab
  const displayedCards = React.useMemo(() => {
    if (cardCategoryTab === 'not_used') return unusedCards;
    if (cardCategoryTab === 'used') return usedCards;
    if (cardCategoryTab === 'custom_requests') return customReqCards;
    return userQrCards;
  }, [cardCategoryTab, userQrCards, unusedCards, usedCards, customReqCards]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans pb-16">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight block text-white">Service Pass Portal</span>
              <span className="text-[10px] text-slate-400 block font-medium">Enterprise Management System</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Bell Dropdown */}
            <div ref={notificationRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifsDropdown(!showNotifsDropdown)}
                className="relative p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
                title="View In-App Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>

              {showNotifsDropdown && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                  <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-400" />
                      <span className="font-extrabold text-xs">In-App Notifications</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded-full font-bold">
                        {unreadNotificationsCount} Unread
                      </span>
                      {unreadNotificationsCount > 0 && (
                        <button type="button" onClick={handleMarkAllNotificationsRead} className="text-[10px] font-bold text-blue-200 hover:text-white">
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {loadingNotifs ? (
                      <div className="p-4 text-center text-xs text-slate-400">Loading notifications...</div>
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                        <p className="font-bold text-slate-600">All caught up!</p>
                        <p>No new notifications at this time.</p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleOpenNotification(n)}
                          className={`p-3 text-xs transition-colors cursor-pointer ${
                            n.read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/70 hover:bg-blue-100/70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                              {n.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1 leading-normal">{n.message}</p>
                          {n.cardCode && (
                            <span className="inline-block mt-1 font-mono text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              Pass {n.cardCode}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 bg-slate-50 border-t border-slate-200 text-center">
                    <button
                      type="button"
                      onClick={() => fetchNotifications()}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                    >
                      Refresh Notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-white">{user.displayName}</div>
              <div className="text-[10px] text-slate-400">{user.email}</div>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* Welcome Banner */}
        <div className="order-first bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-semibold border border-blue-400/30 backdrop-blur-xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active Account Session
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {user.displayName}
            </h1>
          </div>
        </div>

        <div className="order-3 flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 shadow-xs max-w-md">
          <button
            type="button"
            onClick={() => setPortalSection('credentials')}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              portalSection === 'credentials' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" /> Credentials & Passes
          </button>
          <button
            type="button"
            onClick={() => setPortalSection('organization')}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
              portalSection === 'organization' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" /> Organization
          </button>
        </div>

        {/* Credentials & Details Grid */}
        <div className="order-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Assigned Account Credentials */}
          {portalSection === 'credentials' ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 md:col-span-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <h2 className="font-bold text-slate-900 text-sm">Your Assigned Account Credentials</h2>
              </div>
              <button
                onClick={handleCopyCredentials}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy All'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  FULL NAME
                </span>
                <span className="text-xs font-semibold text-slate-900">{currentUser.displayName}</span>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  LOGIN EMAIL
                </span>
                <span className="text-xs font-semibold text-slate-900">{currentUser.email}</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 sm:col-span-2 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      PASSWORD SECURITY & ENCRYPTION
                    </span>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>SHA-256 Hashed & Salted (Protected)</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setChangePassError(null);
                        setOldPasswordInput('');
                        setNewPasswordInput('');
                        setConfirmPasswordInput('');
                        setIsChangePassModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Change Password
                    </button>
                  </div>
                </div>

              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-xs text-blue-900 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-blue-950">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> User-Driven Password Management
              </div>
              <p className="text-blue-800 leading-relaxed">
                You can change your password anytime by clicking <strong className="font-semibold">Change Password</strong> and entering your current password.
              </p>
            </div>
          </div>
          ) : null}

          {portalSection === 'organization' ? (<>
          {/* Card 2: Access & Department Profile */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 md:col-span-3">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-900 text-sm">Organizational Scope</h2>
            </div>

            <div className="space-y-3.5 text-xs">
              {user.accountType === 'client' && user.companyName && (
                <div>
                  <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">COMPANY</span>
                  <div className="flex items-center gap-2 mt-1 font-semibold text-slate-800">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    {user.companyName}
                  </div>
                </div>
              )}
              {user.accountType !== 'client' && (
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                  DEPARTMENT
                </span>
                <div className="flex items-center gap-2 mt-1 font-semibold text-slate-800">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  {user.department}
                </div>
              </div>
              )}

              {user.accountType !== 'client' && (<div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                  ACCESS LEVEL
                </span>
                <div className="mt-1">
                  <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 font-semibold rounded border border-blue-200 text-xs">
                    {user.accessLevel}
                  </span>
                </div>
              </div>
              )}

              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                  SUPERVISING ADMIN
                </span>
                <div className="flex items-center gap-2 mt-1 text-slate-700">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {user.adminEmail}
                </div>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">
                  ACCOUNT CREATED
                </span>
                <div className="flex items-center gap-2 mt-1 text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
          </>) : null}
        </div>

        {/* Additional Notes section if provided by Admin */}
        {portalSection === 'organization' && user.notes && (
          <div className="order-5 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-xs">Administrator Notes & Instructions</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{user.notes}</p>
          </div>
        )}

        {/* Assigned QR Service Pass Cards */}
        <div><div className="order-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-900 text-base">Assigned QR Service Pass Cards</h2>
                <p className="text-xs text-slate-500">
                  Present your pass to service staff to verify & avail services
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => fetchCards(true)}
                disabled={refreshing}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 transition-colors flex items-center gap-1.5"
                title="Refresh pass data and availments"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                {userQrCards.length} Total Pass{userQrCards.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {/* Categorization Filter Tabs & Theme Switcher (Light vs Dark Mode) */}
          {!loadingCards && userQrCards.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200 text-xs font-bold">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCardCategoryTabChange('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                    cardCategoryTab === 'all'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>All Passes</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
                    {userQrCards.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCardCategoryTabChange('not_used')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                    cardCategoryTab === 'not_used'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50/80'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Not Used Cards</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      cardCategoryTab === 'not_used'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {unusedCards.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCardCategoryTabChange('used')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                    cardCategoryTab === 'used'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-blue-800 hover:text-blue-950 hover:bg-blue-50/80'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Used Cards</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      cardCategoryTab === 'used'
                        ? 'bg-blue-700 text-white'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {usedCards.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCardCategoryTabChange('custom_requests')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 ${
                    cardCategoryTab === 'custom_requests'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-purple-800 hover:text-purple-950 hover:bg-purple-50/80'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Custom Requests</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      cardCategoryTab === 'custom_requests'
                        ? 'bg-purple-700 text-white'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {customReqCards.length}
                  </span>
                  {pendingApprovalsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-white animate-pulse">
                      {pendingApprovalsCount} Action Needed
                    </span>
                  )}
                </button>
              </div>

              {/* View Switcher: Digital Pass Cards vs List Table */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs font-bold self-start sm:self-auto shadow-2xs">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2">
                  View Mode:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPassId(null);
                    setPortalViewMode('cards');
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    portalViewMode === 'cards'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Digital Passes</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPassId(null);
                    setPortalViewMode('list');
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                    portalViewMode === 'list'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>List View</span>
                </button>
              </div>
            </div>
          )}

          {loadingCards ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading your assigned QR passes & availment logs...</span>
            </div>
          ) : userQrCards.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 p-8 space-y-2">
              <QrCode className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700 text-sm">No QR Service Passes Assigned Yet</p>
              <p className="text-slate-500 max-w-md mx-auto">
                No QR service pass cards have been assigned to your email ({user.email}). Your administrator can issue passes for your account.
              </p>
            </div>
          ) : displayedCards.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 p-8 space-y-3">
              <Info className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">
                No {cardCategoryTab === 'not_used' ? 'Not Used' : 'Used'} Cards Found
              </p>
              <p className="text-slate-500 max-w-md mx-auto">
                {cardCategoryTab === 'not_used'
                  ? 'All your assigned service passes have had services availed from them.'
                  : 'You have not availed services on any of your assigned pass cards yet.'}
              </p>
              <button
                type="button"
                onClick={() => handleCardCategoryTabChange('all')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
              >
                View All Passes ({userQrCards.length})
              </button>
            </div>
          ) : portalViewMode === 'list' ? (
            cardCategoryTab === 'custom_requests' ? (
              <div className="bg-white rounded-2xl border border-purple-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-purple-50/70 border-b border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-700" />
                      <h3 className="font-extrabold text-purple-950 text-sm">Custom Service Requests Received</h3>
                    </div>
                    <p className="text-xs text-purple-800">
                      Review, accept, or decline specialized customer requests submitted on your assigned passes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pendingApprovalsCount > 0 && (
                      <span className="text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-full animate-pulse">
                        {pendingApprovalsCount} Action{pendingApprovalsCount !== 1 ? 's' : ''} Needed
                      </span>
                    )}
                    <span className="text-xs font-bold bg-purple-200/80 text-purple-900 px-2.5 py-1 rounded-full border border-purple-300">
                      {allUserCustomRequests.length} Custom Request{allUserCustomRequests.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {allUserCustomRequests.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-xs font-medium space-y-2">
                    <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-700">No custom service requests received yet.</p>
                    <p className="text-slate-400">
                      When customers submit custom service requests on your assigned passes, they will appear here for your review and approval.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate-200">
                      <thead className="bg-slate-100/90 text-slate-700 font-extrabold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-4 py-3">Pass & Req ID</th>
                          <th className="px-4 py-3">Customer & Location</th>
                          <th className="px-4 py-3">Custom Request Work</th>
                          <th className="px-4 py-3">Date & Photos</th>
                          <th className="px-4 py-3">Approval Status</th>
                          <th className="px-4 py-3 text-right">Jobber Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium bg-white">
                        {allUserCustomRequests
                          .slice(
                            (passesCurrentPage - 1) * USER_PASSES_PAGE_SIZE,
                            passesCurrentPage * USER_PASSES_PAGE_SIZE
                          )
                          .map(({ card, availment: a }) => {
                            const isPending = !a.approvalStatus || a.approvalStatus === 'pending_approval';
                            const isApproved = a.approvalStatus === 'approved';
                            const isRejected = a.approvalStatus === 'rejected';
                            const addr = a.address;
                            const formattedAddress = addr
                              ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                              : 'N/A';

                            return (
                              <tr
                                key={a.id}
                                onClick={() => setSelectedCustomDetailModal({ card, availment: a })}
                                className={`hover:bg-purple-50/70 transition-colors cursor-pointer group ${
                                  isPending ? 'bg-amber-50/30' : ''
                                }`}
                              >
                                <td className="px-4 py-3.5">
                                  <div className="font-bold text-slate-900 group-hover:text-purple-700 transition-colors">{card.cardTitle}</div>
                                  <div className="font-mono text-[11px] text-blue-600 font-bold">{card.cardCode}</div>
                                  <div className="text-[10px] font-mono text-purple-700 font-extrabold mt-0.5">
                                    REQ #{a.id}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="space-y-1 max-w-xs">
                                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                      <span>{a.contactPersonName || 'N/A'}</span>
                                    </div>
                                    {a.contactNumber && (
                                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>{a.contactNumber}</span>
                                      </div>
                                    )}
                                    <div className="text-[11px] text-slate-700 flex items-start gap-1 font-medium bg-slate-50 p-1.5 rounded border border-slate-200/80">
                                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                      <span className="break-words">{formattedAddress}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 max-w-xs">
                                  <div className="space-y-1">
                                    <div className="p-2 bg-purple-50 rounded-lg border border-purple-200/80 text-purple-950 font-semibold text-xs leading-relaxed break-words">
                                      {a.customRequestDetails || a.remarks || 'Custom Request'}
                                    </div>
                                    {a.approvalNotes && (
                                      <div className="text-[10px] text-slate-600 italic bg-slate-50 p-1.5 rounded border border-slate-200">
                                        <strong>Your Note:</strong> "{a.approvalNotes}"
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="space-y-1.5">
                                    {a.appointmentDate ? (
                                      <div className="text-xs font-bold text-blue-900 flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                        <span>{a.appointmentDate}</span>
                                      </div>
                                    ) : a.targetWeek ? (
                                      <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                        <span>Target: {a.targetWeek}</span>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-slate-400 italic">Date to be scheduled by admin</div>
                                    )}
                                    {a.photos && a.photos.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        {a.photos.map((pUrl, pIdx) => (
                                          <button
                                            key={pIdx}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewPhoto(pUrl);
                                            }}
                                            className="w-8 h-8 rounded-lg border border-slate-200 overflow-hidden hover:scale-105 transition-transform"
                                            title="Click to enlarge"
                                          >
                                            <img src={pUrl} alt="Photo" className="w-full h-full object-cover" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3.5">
                                  {isApproved ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <Check className="w-3 h-3 text-emerald-600" /> Approved
                                    </span>
                                  ) : isRejected ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">
                                      <X className="w-3 h-3 text-red-600" /> Declined
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                      ⏳ Action Needed
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3.5 text-right">
                                  <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    {isPending && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenActionModal(
                                              'accept',
                                              card.cardCode,
                                              a.id,
                                              a.contactPersonName || 'Customer',
                                              a.customRequestDetails || a.remarks || ''
                                            )
                                          }
                                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs transition-colors inline-flex items-center gap-1 shadow-2xs"
                                          title="Accept this request"
                                        >
                                          <ThumbsUp className="w-3 h-3" />
                                          <span>Accept</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenActionModal(
                                              'reject',
                                              card.cardCode,
                                              a.id,
                                              a.contactPersonName || 'Customer',
                                              a.customRequestDetails || a.remarks || ''
                                            )
                                          }
                                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold rounded-lg text-xs transition-colors inline-flex items-center gap-1 border border-rose-200"
                                          title="Decline this request"
                                        >
                                          <ThumbsDown className="w-3 h-3" />
                                          <span>Decline</span>
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedCustomDetailModal({ card, availment: a })}
                                      className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold rounded-lg text-xs transition-colors inline-flex items-center gap-1 border border-purple-200 shadow-2xs"
                                      title="Review full custom request details"
                                    >
                                      <Sparkles className="w-3 h-3 text-purple-600" />
                                      <span>Details</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPassId(card.id);
                                        setExpandedCardHistory((prev) => ({ ...prev, [card.id]: true }));
                                        setPortalViewMode('cards');
                                      }}
                                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors inline-flex items-center gap-1 border border-blue-200/80 shadow-2xs"
                                      title="View Pass and full request timeline"
                                    >
                                      <QrCode className="w-3 h-3" />
                                      <span>View Pass</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination for Custom Requests List */}
                <PaginationControls
                  currentPage={passesCurrentPage}
                  totalItems={allUserCustomRequests.length}
                  pageSize={USER_PASSES_PAGE_SIZE}
                  onPageChange={setPassesCurrentPage}
                />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Assigned Cards & Status List</h3>
                    <p className="text-xs text-slate-500">Summary overview of all digital service passes assigned to you</p>
                  </div>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">
                    {displayedCards.length} Cards
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Card Code & Title</th>
                        <th className="px-4 py-3">Holder / Availed Address</th>
                        <th className="px-4 py-3">Included Services</th>
                        <th className="px-4 py-3">Usage Progress</th>
                        <th className="px-4 py-3">Valid Until</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {displayedCards
                        .slice(
                          (passesCurrentPage - 1) * USER_PASSES_PAGE_SIZE,
                          passesCurrentPage * USER_PASSES_PAGE_SIZE
                        )
                        .map((card) => {
                        const availments = card.availments || [];
                        const latestAvailment = availments.length > 0 ? availments[0] : null;
                        const addr = latestAvailment?.address;
                        const formattedAddress = addr
                          ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                          : '';

                        const availedSet = getAvailedServicesSet(card);
                        const totalServicesCount = card.services.length;
                        const availedCount = availedSet.size;
                        const percentAvailed = totalServicesCount > 0 ? Math.round((availedCount / totalServicesCount) * 100) : 0;
                        const customAvailments = availments.filter((a) => a.isCustomRequest);
                        const customRequestCount = getCustomRequestCount(card);
                        const hasPendingCustom = customAvailments.some(
                          (a) => !a.approvalStatus || a.approvalStatus === 'pending_approval'
                        );

                        return (
                          <tr key={card.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-900">{card.cardTitle}</div>
                              <div className="font-mono text-[11px] text-blue-600 font-semibold">{card.cardCode}</div>
                              {customAvailments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCustomDetailModal({ card, availment: customAvailments[0] });
                                  }}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200 hover:bg-purple-200 transition-colors cursor-pointer"
                                  title="Click to review custom service request details"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                                  <span>
                                    {customAvailments.length} Custom Req{customAvailments.length !== 1 ? 's' : ''}
                                    {hasPendingCustom ? ' ⚠️' : ''}
                                  </span>
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {latestAvailment ? (
                                <div className="space-y-1 max-w-xs">
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                    <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    <span>{latestAvailment.contactPersonName || card.assignedUserName || user.displayName}</span>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded border border-emerald-200">
                                      Availed ({availments.length}x)
                                    </span>
                                  </div>
                                  {formattedAddress && (
                                    <div className="text-[11px] text-slate-700 flex items-start gap-1 font-medium bg-slate-50 p-1.5 rounded border border-slate-200/80">
                                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                      <span className="break-words">{formattedAddress}</span>
                                    </div>
                                  )}
                                  {latestAvailment.contactNumber && (
                                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>{latestAvailment.contactNumber}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <div className="font-bold text-slate-900">{card.assignedUserName || user.displayName}</div>
                                  <div className="text-[10px] text-slate-400 italic mt-0.5">Not availed yet</div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {card.services.map((s, idx) => {
                                  const isUsed = availedSet.has(s);
                                  return (
                                    <span
                                      key={idx}
                                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                        isUsed ? 'line-through bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                      }`}
                                    >
                                      {s}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-800">
                                {availedCount} / {totalServicesCount} Used ({percentAvailed}%)
                              </div>
                              {customRequestCount > 0 && (
                                <div className="text-[10px] font-bold text-purple-700 mt-1">
                                  {customRequestCount} Service Request{customRequestCount === 1 ? '' : 's'}
                                </div>
                              )}
                              <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${percentAvailed}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-slate-600">
                              {card.validUntil ? new Date(card.validUntil).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`px-2 py-1 text-[10px] font-extrabold rounded uppercase tracking-wider ${
                                  card.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-red-100 text-red-800 border border-red-200'
                                }`}
                              >
                                {card.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {hasPendingCustom && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const pendingAvail = customAvailments.find(
                                        (a) => !a.approvalStatus || a.approvalStatus === 'pending_approval'
                                      );
                                      if (pendingAvail) {
                                        handleOpenActionModal(
                                          'accept',
                                          card.cardCode,
                                          pendingAvail.id,
                                          pendingAvail.contactPersonName || 'Customer',
                                          pendingAvail.customRequestDetails || pendingAvail.remarks || ''
                                        );
                                      }
                                    }}
                                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-lg text-xs transition-colors inline-flex items-center gap-1 shadow-2xs animate-pulse"
                                    title="Review pending custom request"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Review Req</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPassId(card.id);
                                    setExpandedCardHistory((prev) => ({ ...prev, [card.id]: true }));
                                    setPortalViewMode('cards');
                                  }}
                                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors inline-flex items-center gap-1.5 border border-blue-200/80 shadow-2xs"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>View Pass</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 10 Items per Page Pagination for List View */}
                <PaginationControls
                  currentPage={passesCurrentPage}
                  totalItems={displayedCards.length}
                  pageSize={USER_PASSES_PAGE_SIZE}
                  onPageChange={setPassesCurrentPage}
                />
              </div>
            )
          ) : (
            <div className="space-y-6">
              {selectedPassId && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">
                        Showing Selected Pass Only
                      </div>
                      <div className="text-slate-600 font-medium text-[11px]">
                        Filtered view for:{' '}
                        <span className="font-mono font-bold text-blue-700">
                          {displayedCards.find((c) => c.id === selectedPassId)?.cardTitle || 'Selected Card'} (
                          {displayedCards.find((c) => c.id === selectedPassId)?.cardCode})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedPassId(null)}
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-blue-700 font-bold rounded-xl border border-blue-200 text-xs shadow-2xs transition-colors"
                    >
                      View All Passes ({displayedCards.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPassId(null);
                        setPortalViewMode('list');
                      }}
                      className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-colors"
                    >
                      Back to List View
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const totalMatching = selectedPassId
                  ? displayedCards.filter((c) => c.id === selectedPassId).length
                  : displayedCards.length;

                const cardsToRender = selectedPassId
                  ? displayedCards.filter((c) => c.id === selectedPassId)
                  : displayedCards.slice(
                      (passesCurrentPage - 1) * USER_PASSES_PAGE_SIZE,
                      passesCurrentPage * USER_PASSES_PAGE_SIZE
                    );

                if (cardsToRender.length === 0) {
                  return (
                    <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 p-8 space-y-3">
                      <Info className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="font-bold text-slate-800 text-sm">Selected Pass Not Found in Current Category</p>
                      <button
                        type="button"
                        onClick={() => {
                          setCardCategoryTab('all');
                          setSelectedPassId(null);
                          setPassesCurrentPage(1);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs"
                      >
                        Show All Passes
                      </button>
                    </div>
                  );
                }

                return (
                  <>
                    {cardsToRender.map((card) => {
                      const availedSet = getAvailedServicesSet(card);
                      const totalServicesCount = card.services.length;
                      const availedCount = availedSet.size;
                      const customRequestCount = getCustomRequestCount(card);
                      const remainingCount = totalServicesCount - availedCount;
                      const percentAvailed = totalServicesCount > 0 ? Math.round((availedCount / totalServicesCount) * 100) : 0;
                      const isHistoryOpen = !!expandedCardHistory[card.id];
                      const availments = card.availments || [];
                      const isLight = true;

                      return (
                        <div
                          key={card.id}
                          className={`rounded-2xl shadow-md overflow-hidden transition-all ${
                            isLight
                              ? 'bg-white text-slate-900 border border-slate-200'
                              : 'bg-slate-900 text-white border border-slate-800'
                          }`}
                        >
                      {/* Top Card Banner Header */}
                      <div
                        className={`p-5 sm:p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isLight
                            ? 'bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border-slate-200 text-slate-900'
                            : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-800 text-white'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded border ${
                                isLight
                                  ? 'text-blue-700 bg-blue-100/80 border-blue-200'
                                  : 'text-blue-400 bg-blue-950/80 border-blue-800/60'
                              }`}
                            >
                              DIGITAL SERVICE PASS
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wider ${
                                card.status === 'active'
                                  ? isLight
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : isLight
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/30'
                              }`}
                            >
                              {card.status}
                            </span>
                          </div>
                          <h3 className={`font-extrabold text-lg tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {card.cardTitle}
                          </h3>
                          <p className={`text-xs flex items-center gap-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            <span>Card Code: <strong className={`font-mono ${isLight ? 'text-blue-700' : 'text-blue-200'}`}>{card.cardCode}</strong></span>
                            <span>•</span>
                            <span>Assigned To: <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>{card.assignedUserName || user.displayName}</strong></span>
                          </p>
                        </div>
                      </div>

                    {/* Middle Details Grid */}
                    <div
                      className={`p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 ${
                        isLight ? 'bg-slate-50/50' : 'bg-slate-950/40'
                      }`}
                    >
                      {/* Left: QR Code Box */}
                      <div
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border space-y-3 ${
                          isLight
                            ? 'bg-white border-slate-200 shadow-2xs'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200">
                          <QrCodeCanvas value={getCardVerificationUrl(card)} size={135} />
                        </div>
                        <div className="text-center space-y-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            VALID UNTIL
                          </span>
                          <span className={`font-bold text-xs flex items-center justify-center gap-1 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            {card.validUntil}
                          </span>
                          {card.firstAvailedDate && (
                            <span className={`text-[10px] font-semibold block ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                              🗓️ 1 Year from 1st Service ({card.firstAvailedDate})
                            </span>
                          )}
                        </div>
                        <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const url = getCardVerificationUrl(card);
                              navigator.clipboard.writeText(url);
                              onSuccess('Unique pass link copied to clipboard!');
                            }}
                            className={`flex-1 min-h-10 sm:min-h-0 py-2 sm:py-1.5 text-[11px] font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                              isLight
                                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border-blue-500/30'
                            }`}
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy Pass Link
                          </button>
                          <a
                            href={getCardVerificationUrl(card)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`min-h-10 sm:min-h-0 py-2 sm:py-1.5 px-2.5 text-[11px] font-bold rounded-lg border transition-colors flex items-center justify-center gap-1 shrink-0 ${
                              isLight
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            }`}
                            title="Open verification page in a new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                            <span>Go to this link</span>
                          </a>
                        </div>
                      </div>

                      {/* Right: Service Entitlements & Availment Progress */}
                      <div className="lg:col-span-2 space-y-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                              <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                Entitled Services Breakdown
                              </h4>
                            </div>
                            <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                              <strong className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>{availedCount}</strong> / {totalServicesCount} Availed ({percentAvailed}%)
                            </span>
                          </div>
                          {customRequestCount > 0 && (
                            <div className="text-xs font-bold text-purple-700 mb-2">
                              {customRequestCount} separate service request{customRequestCount === 1 ? '' : 's'}
                            </div>
                          )}

                          {/* Progress bar */}
                          <div className={`w-full h-2 rounded-full overflow-hidden mb-4 border ${isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-800 border-slate-700/50'}`}>
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                              style={{ width: `${percentAvailed}%` }}
                            />
                          </div>

                          {/* Services List Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {card.services.map((svc, idx) => {
                              const isAvailed = availedSet.has(svc.trim());
                              return (
                                <div
                                  key={idx}
                                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all ${
                                    isAvailed
                                      ? isLight
                                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                                        : 'bg-slate-900/90 text-slate-400 border-slate-800'
                                      : isLight
                                      ? 'bg-blue-50/70 text-blue-900 border-blue-200 shadow-2xs'
                                      : 'bg-blue-950/40 text-blue-100 border-blue-800/60 shadow-2xs'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                    {isAvailed ? (
                                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                    ) : (
                                      <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                                    )}
                                    <span className={`truncate ${isAvailed ? 'line-through decoration-slate-400' : ''}`}>
                                      {svc}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded shrink-0 ${
                                      isAvailed
                                        ? isLight
                                          ? 'bg-slate-200 text-slate-600 border border-slate-300'
                                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                                        : isLight
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                                    }`}
                                  >
                                    {isAvailed ? 'Availed' : 'Available'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Summary Footer bar on card */}
                        <div className={`pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800/80 text-slate-400'}`}>
                          <div className="flex items-center gap-1.5">
                            <Info className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                            <span>
                              {remainingCount > 0
                                ? `${remainingCount} service(s) available for request`
                                : 'All entitlement services have been availed'}
                            </span>
                          </div>

                          {availments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleHistoryExpand(card.id)}
                              className={`text-xs font-bold flex items-center gap-1 transition-colors ${
                                isLight
                                  ? 'text-blue-700 hover:text-blue-900'
                                  : 'text-blue-300 hover:text-white'
                              }`}
                            >
                              <span>{isHistoryOpen ? 'Hide Request Logs' : `View ${availments.length} Request Log(s)`}</span>
                              {isHistoryOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Expanded Section: Detailed Service Availments / Requests History */}
                    {availments.length > 0 && (
                      <div className={`border-t transition-all ${isHistoryOpen ? 'block' : 'hidden'} ${isLight ? 'border-slate-200 bg-slate-100/70' : 'border-slate-800 bg-slate-900/90'}`}>
                        <div className="p-5 sm:p-6 space-y-4">
                          <div className={`flex items-center justify-between border-b pb-3 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                            <div className="flex items-center gap-2">
                              <FileText className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                              <h4 className={`font-extrabold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>Service Availment Request History</h4>
                            </div>
                            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded border ${isLight ? 'text-emerald-800 bg-emerald-100 border-emerald-200' : 'text-emerald-300 bg-emerald-950/80 border-emerald-800/60'}`}>
                              {availments.length} Total Request{availments.length !== 1 ? 's' : ''} Submitted
                            </span>
                          </div>

                          <div className="space-y-3">
                            {availments.map((req: ServiceAvailment, reqIdx: number) => (
                              <div
                                key={req.id || reqIdx}
                                className={`p-4 rounded-xl border text-xs space-y-3 ${
                                  isLight
                                    ? 'bg-white border-slate-200 shadow-2xs text-slate-800'
                                    : 'bg-slate-950 border-slate-800 text-slate-300'
                                }`}
                              >
                                {/* Request Row Header */}
                                <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2 ${isLight ? 'border-slate-100' : 'border-slate-800/80'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-400'}`}>
                                      #{availments.length - reqIdx}
                                    </span>
                                    <span className={`font-extrabold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                      Submitted: {new Date(req.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <span
                                    className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                                      req.status === 'completed'
                                        ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30'
                                        : req.status === 'in_progress'
                                        ? 'bg-blue-500/20 text-blue-700 border-blue-500/30'
                                        : 'bg-amber-500/20 text-amber-700 border-amber-500/30'
                                    }`}
                                  >
                                    {(req.status || 'pending').replace('_', ' ')}
                                  </span>
                                </div>

                                {/* Request Details Grid */}
                                <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                  {/* Requested Services */}
                                  <div className="space-y-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                      AVAILED SERVICES ({req.requestedServices?.length || 0})
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {req.requestedServices?.map((svc, sIdx) => (
                                        <span
                                          key={sIdx}
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 font-bold text-[10px] rounded border ${
                                            isLight
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                                          }`}
                                        >
                                          <CheckCircle2 className={`w-3 h-3 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                          {svc}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Appointment Schedule */}
                                  <div className="space-y-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                      SCHEDULED APPOINTMENT
                                    </span>
                                    <div className={`flex items-center gap-1.5 font-semibold p-2 rounded border ${
                                      isLight
                                        ? 'bg-slate-50 text-emerald-800 border-slate-200'
                                        : 'bg-slate-900 text-emerald-300 border-slate-800'
                                    }`}>
                                      <Clock className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                      <span>
                                        {req.appointmentDate || 'N/A'} {req.appointmentTimeSlot ? `• ${req.appointmentTimeSlot}` : ''}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Contact Details */}
                                  <div className="space-y-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                      CONTACT PERSON
                                    </span>
                                    <div className={`flex items-center gap-3 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                                      <span className="flex items-center gap-1 font-semibold">
                                        <User className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                                        {req.contactPersonName}
                                      </span>
                                      <span className={`flex items-center gap-1 font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                        <Phone className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                                        {req.contactNumber}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Address */}
                                  <div className="space-y-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                      SERVICE LOCATION
                                    </span>
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                                      <span>
                                        {req.address.streetAddress}
                                        {req.address.aptSuite ? `, ${req.address.aptSuite}` : ''}, {req.address.city}, {req.address.state} {req.address.zipCode}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Remarks if any */}
                                {req.remarks && (
                                  <div className={`p-2.5 rounded border italic ${
                                    isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }`}>
                                    <strong className={`not-italic font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Remarks: </strong>
                                    {req.remarks}
                                  </div>
                                )}

                                {/* Custom Request Banner & Approval Action Card */}
                                {req.isCustomRequest && (
                                  <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 text-purple-950 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 font-black text-xs text-purple-800">
                                        <Sparkles className="w-4 h-4 text-purple-600" />
                                        <span>CUSTOM SERVICE REQUEST</span>
                                      </div>
                                      <span
                                        className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${
                                          req.approvalStatus === 'approved'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                            : req.approvalStatus === 'rejected'
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
                                        }`}
                                      >
                                        {req.approvalStatus === 'approved'
                                          ? '✓ Approved by You'
                                          : req.approvalStatus === 'rejected'
                                          ? '✕ Declined by You'
                                          : '⚡ Action Required: Pending Your Approval'}
                                      </span>
                                    </div>

                                    <div className="text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-purple-200/80 font-medium">
                                      <strong className="text-purple-900 font-bold block mb-0.5">Request Details:</strong>
                                      {req.customRequestDetails || req.remarks || 'No detailed description provided.'}
                                    </div>

                                    {/* Action Buttons for Pending Custom Request */}
                                    {(!req.approvalStatus || req.approvalStatus === 'pending_approval') && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenActionModal(
                                              'accept',
                                              card.cardCode,
                                              req.id || '',
                                              req.contactPersonName,
                                              req.customRequestDetails || req.remarks || ''
                                            )
                                          }
                                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                                        >
                                          <ThumbsUp className="w-3.5 h-3.5" /> Accept Request
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenActionModal(
                                              'reject',
                                              card.cardCode,
                                              req.id || '',
                                              req.contactPersonName,
                                              req.customRequestDetails || req.remarks || ''
                                            )
                                          }
                                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                                        >
                                          <ThumbsDown className="w-3.5 h-3.5" /> Decline Request
                                        </button>
                                        <span className="text-[11px] text-purple-700 font-medium ml-1">
                                          (Only you can accept or decline this custom request)
                                        </span>
                                      </div>
                                    )}

                                    {req.approvalNotes && (
                                      <p className="text-[11px] text-slate-600 italic">
                                        <strong>Your Response Notes:</strong> {req.approvalNotes}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Admin Work Completion Proof Photos if available */}
                                {req.completionPhotos && req.completionPhotos.length > 0 && (
                                  <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                                    isLight ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                                  }`}>
                                    <span className="font-extrabold uppercase tracking-wider text-[10px] text-emerald-700 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Admin Verified Work Completion Proof ({req.completionPhotos.length})
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {req.completionPhotos.map((cPhoto, cIdx) => (
                                        <button
                                          key={cIdx}
                                          type="button"
                                          onClick={() => setPreviewPhoto(cPhoto)}
                                          className="w-16 h-16 rounded-lg overflow-hidden border-2 border-emerald-400 hover:border-emerald-600 transition-all relative group"
                                        >
                                          <img src={cPhoto} alt={`Work proof ${cIdx + 1}`} className="w-full h-full object-cover" />
                                          <div className="absolute inset-0 bg-emerald-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] font-bold text-white transition-opacity">
                                            View
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                    {req.completedAt && (
                                      <p className="text-[10px] font-semibold text-emerald-600">
                                        Marked completed on {new Date(req.completedAt).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Customer Issue Photo attachments gallery */}
                                {req.photos && req.photos.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                      <ImageIcon className={`w-3 h-3 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                                      ATTACHED ISSUE PHOTOS ({req.photos.length})
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {req.photos.map((photoUrl, pIdx) => (
                                        <button
                                          key={pIdx}
                                          type="button"
                                          onClick={() => setPreviewPhoto(photoUrl)}
                                          className={`relative group w-16 h-16 rounded-lg overflow-hidden border transition-all focus:outline-none ${
                                            isLight
                                              ? 'border-slate-200 bg-slate-100 hover:border-blue-500'
                                              : 'border-slate-800 bg-black hover:border-blue-500'
                                          }`}
                                        >
                                          <img
                                            src={photoUrl}
                                            alt={`Attached issue ${pIdx + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                          />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] font-bold text-white">
                                            View
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {!selectedPassId && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <PaginationControls
                    currentPage={passesCurrentPage}
                    totalItems={totalMatching}
                    pageSize={USER_PASSES_PAGE_SIZE}
                    onPageChange={setPassesCurrentPage}
                  />
                </div>
              )}
            </>
          );
        })()}
      </div>
          )}
      </div>
        </div>
      </main>

      {/* Photo Lightbox Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-2xl p-4 border border-slate-800 shadow-2xl flex flex-col items-center">
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="font-bold text-sm text-white mb-3">Service Location Attachment</h4>
            <div className="max-h-[75vh] overflow-auto rounded-xl bg-black flex items-center justify-center p-2">
              <img
                src={previewPhoto}
                alt="Enlarged service location preview"
                className="max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePassModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200">
            <button
              onClick={() => setIsChangePassModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Change Your Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                Your new password will be hashed and stored securely with SHA-256 encryption.
              </p>
            </div>

            {changePassError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
                {changePassError}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <input
                  type={showModalPass ? 'text' : 'password'}
                  value={oldPasswordInput}
                  onChange={(e) => setOldPasswordInput(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  New Password (Min 6 chars)
                </label>
                <input
                  type={showModalPass ? 'text' : 'password'}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <input
                  type={showModalPass ? 'text' : 'password'}
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setShowModalPass(!showModalPass)}
                  className="text-slate-500 hover:text-slate-700 flex items-center gap-1 font-medium"
                >
                  {showModalPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showModalPass ? 'Hide passwords' : 'Show passwords'}
                </button>

              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsChangePassModalOpen(false)}
                  className="w-1/2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPass}
                  className="w-1/2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {changingPass ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Save New Password'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom Request Action Modal (Accept or Reject) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <button
              onClick={() => setActionModal(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  actionModal.action === 'accept'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-rose-100 text-rose-600'
                }`}
              >
                {actionModal.action === 'accept' ? (
                  <ThumbsUp className="w-5 h-5" />
                ) : (
                  <ThumbsDown className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  {actionModal.action === 'accept'
                    ? 'Accept Custom Request'
                    : 'Decline Custom Request'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Pass: {actionModal.cardCode} • Customer: {actionModal.customerName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">
                Requested Custom Work:
              </span>
              <p className="italic">{actionModal.details || 'No details specified.'}</p>
            </div>

            <form onSubmit={handleExecuteActionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {actionModal.action === 'accept'
                    ? 'Notes / Preparation Instructions for Customer (Optional)'
                    : 'Reason for Declining (Sent to Customer & Admin)'}
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  required={actionModal.action === 'reject'}
                  placeholder={
                    actionModal.action === 'accept'
                      ? 'e.g. Approved. Will bring specialized equipment on scheduled appointment.'
                      : 'e.g. Unable to fulfill this specific modification due to high-voltage restrictions.'
                  }
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-[11px] flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Confirming this action will dispatch automated email notices to both the customer and administrator, and update the schedule status.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className={`px-4 py-2 font-bold text-xs rounded-xl text-white shadow-xs transition-colors flex items-center gap-1.5 ${
                    actionModal.action === 'accept'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  } disabled:opacity-60`}
                >
                  {actionSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : actionModal.action === 'accept' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {actionSubmitting
                      ? 'Processing...'
                      : actionModal.action === 'accept'
                      ? 'Confirm & Accept Request'
                      : 'Confirm & Decline Request'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Custom Request Details Modal */}
      {selectedCustomDetailModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Custom Service Request Details</h3>
                  <p className="text-xs text-purple-200">
                    Pass: <span className="font-mono font-bold text-white">{selectedCustomDetailModal.card.cardCode}</span> • REQ #{selectedCustomDetailModal.availment.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomDetailModal(null)}
                className="p-1.5 text-purple-200 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 flex-1">
              {/* Approval Status Banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                selectedCustomDetailModal.availment.approvalStatus === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : selectedCustomDetailModal.availment.approvalStatus === 'rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center gap-2">
                  {selectedCustomDetailModal.availment.approvalStatus === 'approved' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : selectedCustomDetailModal.availment.approvalStatus === 'rejected' ? (
                    <X className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                  )}
                  <div>
                    <span className="font-extrabold text-xs block">
                      {selectedCustomDetailModal.availment.approvalStatus === 'approved'
                        ? 'Approved by You (Jobber)'
                        : selectedCustomDetailModal.availment.approvalStatus === 'rejected'
                        ? 'Declined by You'
                        : 'Awaiting Your Jobber Approval'}
                    </span>
                    {selectedCustomDetailModal.availment.approvalStatus === 'approved' && (
                      <span className="text-[11px] text-emerald-700">
                        {selectedCustomDetailModal.availment.appointmentDate
                          ? `Scheduled by admin for: ${selectedCustomDetailModal.availment.appointmentDate}`
                          : 'Approved! Admin will now schedule the confirmed service date.'}
                      </span>
                    )}
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full font-black text-[10px] uppercase tracking-wider ${
                  selectedCustomDetailModal.availment.approvalStatus === 'approved'
                    ? 'bg-emerald-200 text-emerald-900'
                    : selectedCustomDetailModal.availment.approvalStatus === 'rejected'
                    ? 'bg-rose-200 text-rose-900'
                    : 'bg-amber-200 text-amber-900'
                }`}>
                  {selectedCustomDetailModal.availment.approvalStatus || 'Pending'}
                </span>
              </div>

              {/* Customer Contact & Address Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                    Customer Contact
                  </span>
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <User className="w-4 h-4 text-purple-600" />
                    <span>{selectedCustomDetailModal.availment.contactPersonName || 'N/A'}</span>
                  </div>
                  {selectedCustomDetailModal.availment.contactNumber && (
                    <div className="text-slate-600 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{selectedCustomDetailModal.availment.contactNumber}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                    Timeline & Timing
                  </span>
                  {selectedCustomDetailModal.availment.appointmentDate ? (
                    <div className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>{selectedCustomDetailModal.availment.appointmentDate}</span>
                    </div>
                  ) : (
                    <div className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-purple-600" />
                      <span>Target: {selectedCustomDetailModal.availment.targetWeek || 'Target week pending'}</span>
                    </div>
                  )}
                  <div className="text-slate-500 text-[11px]">
                    Requested on: {new Date(selectedCustomDetailModal.availment.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Full Address */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                  Service Location
                </span>
                <div className="flex items-start gap-1.5 font-semibold text-slate-800 text-xs">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>
                    {selectedCustomDetailModal.availment.address
                      ? `${selectedCustomDetailModal.availment.address.streetAddress}${
                          selectedCustomDetailModal.availment.address.aptSuite
                            ? ', ' + selectedCustomDetailModal.availment.address.aptSuite
                            : ''
                        }, ${selectedCustomDetailModal.availment.address.city}, ${
                          selectedCustomDetailModal.availment.address.state
                        } ${selectedCustomDetailModal.availment.address.zipCode}`
                      : 'Address not provided'}
                  </span>
                </div>
              </div>

              {/* Custom Work Requirement */}
              <div className="p-3.5 bg-purple-50/80 rounded-xl border border-purple-200 space-y-1.5">
                <span className="text-[10px] uppercase font-extrabold text-purple-800 block tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-600" /> Custom Work Requirement:
                </span>
                <p className="text-purple-950 font-medium leading-relaxed whitespace-pre-wrap">
                  {selectedCustomDetailModal.availment.customRequestDetails ||
                    selectedCustomDetailModal.availment.remarks ||
                    'Custom service requested.'}
                </p>
              </div>

              {/* Jobber Notes (if already provided) */}
              {selectedCustomDetailModal.availment.approvalNotes && (
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] uppercase font-extrabold text-slate-600 block tracking-wider">
                    Your Response Notes:
                  </span>
                  <p className="italic text-slate-800">
                    "{selectedCustomDetailModal.availment.approvalNotes}"
                  </p>
                </div>
              )}

              {/* Photos Gallery */}
              {selectedCustomDetailModal.availment.photos && selectedCustomDetailModal.availment.photos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                    Attached Site Photos ({selectedCustomDetailModal.availment.photos.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedCustomDetailModal.availment.photos.map((pUrl, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setPreviewPhoto(pUrl)}
                        className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden hover:scale-105 transition-transform shadow-2xs"
                        title="Click to zoom photo"
                      >
                        <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const card = selectedCustomDetailModal.card;
                  setSelectedCustomDetailModal(null);
                  setSelectedPassId(card.id);
                  setExpandedCardHistory((prev) => ({ ...prev, [card.id]: true }));
                  setPortalViewMode('cards');
                }}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span>View Full Pass</span>
              </button>

              <div className="flex items-center gap-2">
                {(!selectedCustomDetailModal.availment.approvalStatus ||
                  selectedCustomDetailModal.availment.approvalStatus === 'pending_approval') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const item = selectedCustomDetailModal;
                        setSelectedCustomDetailModal(null);
                        handleOpenActionModal(
                          'reject',
                          item.card.cardCode,
                          item.availment.id,
                          item.availment.contactPersonName || 'Customer',
                          item.availment.customRequestDetails || item.availment.remarks || ''
                        );
                      }}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs rounded-xl transition-colors inline-flex items-center gap-1 border border-rose-200"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const item = selectedCustomDetailModal;
                        setSelectedCustomDetailModal(null);
                        handleOpenActionModal(
                          'accept',
                          item.card.cardCode,
                          item.availment.id,
                          item.availment.contactPersonName || 'Customer',
                          item.availment.customRequestDetails || item.availment.remarks || ''
                        );
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Accept Request</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCustomDetailModal(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

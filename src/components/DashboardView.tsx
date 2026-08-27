import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { AdminUserProfile, QrCard, ServiceAvailment } from '../types';
import { isQrCardUsed, updateAvailmentScheduleDate } from '../lib/userService';
import { PaginationControls } from './PaginationControls';
import {
  Calendar,
  CheckCircle2,
  UserCheck,
  QrCode,
  Search,
  ExternalLink,
  Copy,
  Check,
  Filter,
  MapPin,
  Clock,
  ShieldCheck,
  User as UserIcon,
  Phone,
  ImageIcon,
  Sparkles,
  X,
  ChevronRight,
  Info,
  LayoutGrid,
  List,
  RefreshCw
} from 'lucide-react';

interface DashboardViewProps {
  authUser: User;
  profile: AdminUserProfile | null;
  qrCards?: QrCard[];
  managedUsersCount?: number;
  onNavigateManagedUsers: () => void;
  onNavigateQrCards: () => void;
  onNavigateSchedule?: () => void;
  onNavigateProfile: () => void;
  onScheduleAvailment?: (cardCode: string, availmentId: string, appointmentDate: string, appointmentTimeSlot?: string) => void;
  onSuccessToast?: (msg: string) => void;
}

interface ScheduledCallItem {
  cardId: string;
  cardTitle: string;
  cardCode: string;
  assignedUserName?: string;
  assignedUserEmail?: string;
  availment: ServiceAvailment;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  authUser,
  profile,
  qrCards = [],
  managedUsersCount = 0,
  onNavigateManagedUsers,
  onNavigateQrCards,
  onNavigateSchedule,
  onNavigateProfile,
  onScheduleAvailment,
  onSuccessToast
}) => {
  const displayName = profile?.displayName || authUser.displayName || authUser.email?.split('@')[0] || 'Admin';
  const roleLabel = profile?.role ? profile.role.replace('_', ' ') : 'Admin';

  // Search & Status filter state for Cards list table
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & Filter state for Scheduled QR Service Calls
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState('');
  const [scheduleDateFilter, setScheduleDateFilter] = useState<string>('all');
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<string>('all');
  const [scheduleViewMode, setScheduleViewMode] = useState<'card' | 'list'>('list');
  const [scheduleCurrentPage, setScheduleCurrentPage] = useState<number>(1);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedDetailCall, setSelectedDetailCall] = useState<ScheduledCallItem | null>(null);

  // Schedule Custom Request Modal State
  const [scheduleModalItem, setScheduleModalItem] = useState<ScheduledCallItem | null>(null);
  const [scheduleModalDate, setScheduleModalDate] = useState<string>('');
  const [scheduleModalTimeSlot, setScheduleModalTimeSlot] = useState<string>('09:00 AM - 10:00 AM');
  const [scheduleModalSubmitting, setScheduleModalSubmitting] = useState<boolean>(false);

  // Custom Requests Overview Block Filter
  const [customReqFilter, setCustomReqFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [customReqPage, setCustomReqPage] = useState<number>(1);
  const CUSTOM_REQ_PAGE_SIZE = 6;

  // Extract all scheduled service call availments across all QR cards
  // Strict separation: standard service calls in allScheduledCalls, custom requests in allCustomRequests
  const allScheduledCalls: ScheduledCallItem[] = [];
  const allCustomRequests: ScheduledCallItem[] = [];

  qrCards.forEach((card) => {
    (card.availments || []).forEach((availment) => {
      const item: ScheduledCallItem = {
        cardId: card.id,
        cardTitle: card.cardTitle,
        cardCode: card.cardCode,
        assignedUserName: card.assignedUserName,
        assignedUserEmail: card.assignedUserEmail,
        availment
      };
      if (availment.isCustomRequest) {
        allCustomRequests.push(item);
      } else {
        allScheduledCalls.push(item);
      }
    });
  });

  // Sort standard service calls by latest request timestamp descending (newest first by default)
  allScheduledCalls.sort((a, b) => {
    const dateA = a.availment.timestamp || a.availment.appointmentDate || '';
    const dateB = b.availment.timestamp || b.availment.appointmentDate || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Sort custom requests by latest request timestamp descending (newest first by default)
  allCustomRequests.sort((a, b) => {
    const dateA = a.availment.timestamp || a.availment.appointmentDate || '';
    const dateB = b.availment.timestamp || b.availment.appointmentDate || '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // Filter custom requests for the dedicated Custom Requests Block
  const filteredCustomRequests = allCustomRequests.filter((item) => {
    const a = item.availment;
    if (customReqFilter === 'approved') return a.approvalStatus === 'approved';
    if (customReqFilter === 'pending') return a.approvalStatus === 'pending_approval' || !a.approvalStatus;
    if (customReqFilter === 'rejected') return a.approvalStatus === 'rejected';
    return true;
  });

  const customApprovedCount = allCustomRequests.filter((r) => r.availment.approvalStatus === 'approved').length;
  const customPendingCount = allCustomRequests.filter((r) => r.availment.approvalStatus === 'pending_approval' || !r.availment.approvalStatus).length;
  const customRejectedCount = allCustomRequests.filter((r) => r.availment.approvalStatus === 'rejected').length;

  const paginatedCustomRequests = filteredCustomRequests.slice(
    (customReqPage - 1) * CUSTOM_REQ_PAGE_SIZE,
    customReqPage * CUSTOM_REQ_PAGE_SIZE
  );

  // Filter scheduled calls
  const filteredScheduledCalls = allScheduledCalls.filter((item) => {
    const a = item.availment;
    const addr = a.address;
    const fullAddrStr = addr
      ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
      : '';
    const servicesStr = (a.requestedServices || []).join(' ');

    const matchesSearch =
      item.cardTitle.toLowerCase().includes(scheduleSearchTerm.toLowerCase()) ||
      item.cardCode.toLowerCase().includes(scheduleSearchTerm.toLowerCase()) ||
      (item.assignedUserName && item.assignedUserName.toLowerCase().includes(scheduleSearchTerm.toLowerCase())) ||
      (a.contactPersonName && a.contactPersonName.toLowerCase().includes(scheduleSearchTerm.toLowerCase())) ||
      (a.contactNumber && a.contactNumber.includes(scheduleSearchTerm)) ||
      (a.appointmentDate && a.appointmentDate.includes(scheduleSearchTerm)) ||
      (a.customRequestDetails && a.customRequestDetails.toLowerCase().includes(scheduleSearchTerm.toLowerCase())) ||
      fullAddrStr.toLowerCase().includes(scheduleSearchTerm.toLowerCase()) ||
      servicesStr.toLowerCase().includes(scheduleSearchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Status Filter
    const callStatus = a.status || 'pending';
    if (scheduleStatusFilter === 'pending' && callStatus === 'completed') return false;
    if (scheduleStatusFilter === 'completed' && callStatus !== 'completed') return false;

    if (scheduleDateFilter === 'today') {
      return a.appointmentDate === todayStr;
    } else if (scheduleDateFilter === 'upcoming') {
      return a.appointmentDate ? a.appointmentDate >= todayStr : true;
    } else if (scheduleDateFilter === 'past') {
      return a.appointmentDate ? a.appointmentDate < todayStr : false;
    }

    return true;
  });

  const SCHEDULE_PAGE_SIZE = 10;
  const paginatedScheduledCalls = filteredScheduledCalls.slice(
    (scheduleCurrentPage - 1) * SCHEDULE_PAGE_SIZE,
    scheduleCurrentPage * SCHEDULE_PAGE_SIZE
  );

  // Reset page when filter/search changes
  const handleScheduleSearchChange = (val: string) => {
    setScheduleSearchTerm(val);
    setScheduleCurrentPage(1);
  };

  const handleScheduleDateFilterChange = (val: string) => {
    setScheduleDateFilter(val);
    setScheduleCurrentPage(1);
  };

  const handleScheduleStatusFilterChange = (val: string) => {
    setScheduleStatusFilter(val);
    setScheduleCurrentPage(1);
  };

  // Card Stats
  const totalCardsCount = qrCards.length;
  const activeCardsCount = qrCards.filter((c) => c.status === 'active' && !isQrCardUsed(c)).length;
  const usedCardsCount = qrCards.filter((c) => isQrCardUsed(c)).length;

  // Filtered Cards for Dashboard List View
  const filteredCards = qrCards.filter((card) => {
    const availments = card.availments || [];
    const latestAvailment = availments.length > 0 ? availments[0] : null;
    const addr = latestAvailment?.address;
    const fullAddrStr = addr
      ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
      : '';

    const matchesSearch =
      card.cardTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.cardCode && card.cardCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (card.assignedUserName && card.assignedUserName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (card.assignedUserEmail && card.assignedUserEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (latestAvailment?.contactPersonName && latestAvailment.contactPersonName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (fullAddrStr && fullAddrStr.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const handleCopyLink = (cardId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?cardId=${cardId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(cardId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-15 bg-gradient-to-l from-blue-500 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-md text-xs font-semibold mb-3 border border-blue-500/30">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              PLS QServe Portal Session <span className="text-[10px] text-amber-600 uppercase tracking-wider">Prototype v0.1.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {displayName}!
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Signed in as <span className="font-semibold text-blue-400 uppercase text-xs tracking-wider">{roleLabel}</span> on PLS QServe Digital Service Pass System.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={onNavigateQrCards}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              QR Cards Generator
            </button>
            <button
              onClick={onNavigateManagedUsers}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 transition-all flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              Managed End Users
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Service Cards</p>
            <p className="text-2xl font-bold text-slate-900">{totalCardsCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active / Unused Cards</p>
            <p className="text-2xl font-bold text-emerald-700">{activeCardsCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active / Used Cards</p>
            <p className="text-2xl font-bold text-indigo-700">{usedCardsCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Managed End Users</p>
            <p className="text-2xl font-bold text-slate-900">{managedUsersCount}</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-blue-200/90 shadow-md overflow-hidden">
        <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-md text-[10px] font-extrabold uppercase tracking-widest mb-1.5 border border-blue-400/30">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              Live Service Appointments
            </div>
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Scheduled Standard QR Service Calls
            </h2>
            <p className="text-xs text-blue-200/90 mt-0.5">
              Live upcoming standard service call bookings and appointments. Bespoke custom service requests are listed in the dedicated section below.
            </p>
          </div>

          {/* Filter & Search Toolbar for Scheduled Calls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher Toggle */}
            <div className="flex items-center bg-slate-800/90 p-1 border border-slate-700 rounded-lg">
              <button
                type="button"
                onClick={() => setScheduleViewMode('card')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
                  scheduleViewMode === 'card'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Card View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleViewMode('list')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
                  scheduleViewMode === 'list'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>

            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={scheduleSearchTerm}
                onChange={(e) => handleScheduleSearchChange(e.target.value)}
                placeholder="Search date, contact, address, code..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800/90 border border-slate-700 text-white placeholder-slate-400 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <select
                value={scheduleStatusFilter}
                onChange={(e) => handleScheduleStatusFilterChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-bold"
              >
                <option value="all" className="bg-slate-900 text-white">All Statuses</option>
                <option value="pending" className="bg-slate-900 text-white">Pending / Scheduled Only</option>
                <option value="completed" className="bg-slate-900 text-white">Completed Calls Only</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <select
                value={scheduleDateFilter}
                onChange={(e) => handleScheduleDateFilterChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-bold"
              >
                <option value="all" className="bg-slate-900 text-white">All Dates ({allScheduledCalls.length})</option>
                <option value="upcoming" className="bg-slate-900 text-white">Upcoming Dates</option>
                <option value="today" className="bg-slate-900 text-white">Today's Service Calls</option>
                <option value="past" className="bg-slate-900 text-white">Past History</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scheduled Calls Body: Empty / Cards / List Table */}
        {filteredScheduledCalls.length === 0 ? (
          <div className="p-10 text-center bg-slate-50/50">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No Scheduled QR Service Calls Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              {scheduleSearchTerm || scheduleDateFilter !== 'all'
                ? 'No service calls match your search filter. Try clearing filters.'
                : 'No end-user service requests have been scheduled on QR cards yet. When card holders scan their pass and select a service date, bookings will appear here.'}
            </p>
            {onNavigateSchedule && (
              <button
                onClick={onNavigateSchedule}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" /> Configure Weekday Service Schedule
              </button>
            )}
          </div>
        ) : scheduleViewMode === 'card' ? (
          /* CARD VIEW */
          <div className="p-5 bg-slate-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedScheduledCalls.map((item, idx) => {
                const a = item.availment;
                const addr = a.address;
                const formattedAddress = addr
                  ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                  : 'N/A';
                const verificationUrl = `${window.location.origin}${window.location.pathname}?cardId=${item.cardId}`;
                const isToday = a.appointmentDate === todayStr;

                return (
                  <div
                    key={a.id || idx}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-3">
                      {/* Top Bar: Date & Today Badge */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                          <Calendar className={`w-4 h-4 ${isToday ? 'text-amber-600' : 'text-blue-600'}`} />
                          <span>{a.appointmentDate || 'Not specified'}</span>
                        </div>
                        {isToday ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-black uppercase rounded border border-amber-300">
                            Today's Call
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-extrabold uppercase rounded border border-blue-200">
                            Scheduled
                          </span>
                        )}
                      </div>

                      {/* Card Info */}
                      <div>
                        <div className="text-xs font-black text-slate-900">{item.cardTitle}</div>
                        <div className="text-[11px] font-mono font-bold text-blue-600">{item.cardCode}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          <span>Assigned Staff: {item.assignedUserName || 'Open / Unassigned'}</span>
                        </div>
                      </div>

                      {/* Contact Details */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{a.contactPersonName || 'N/A'}</span>
                        </div>
                        <div className="text-[11px] font-bold text-indigo-700 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{a.contactNumber || 'N/A'}</span>
                        </div>
                        <div className="text-[11px] text-slate-700 flex items-start gap-1.5 pt-1 border-t border-slate-200/60 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="font-semibold">{formattedAddress}</span>
                        </div>
                      </div>

                      {/* Requested Services */}
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                          Requested Services:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {(a.requestedServices || []).map((svc, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-800 font-bold rounded border border-blue-200"
                            >
                              {svc}
                            </span>
                          ))}
                        </div>
                        {a.remarks && (
                          <div className="text-[10px] text-slate-500 italic mt-1 bg-slate-50 p-1.5 rounded border border-slate-200">
                            "{a.remarks}"
                          </div>
                        )}
                      </div>

                      {/* Attached Photos */}
                      {a.photos && a.photos.length > 0 && (
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                            Attached Photos ({a.photos.length}):
                          </span>
                          <div className="flex items-center gap-1.5">
                            {a.photos.map((pUrl, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setPreviewImage(pUrl)}
                                className="w-10 h-10 rounded-lg border border-slate-200 overflow-hidden hover:scale-105 transition-transform"
                                title="Click to enlarge photo"
                              >
                                <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleCopyLink(item.cardId)}
                        className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-colors inline-flex items-center justify-center gap-1"
                        title="Copy Pass Verification Link"
                      >
                        {copiedId === item.cardId ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-500" />
                        )}
                        {copiedId === item.cardId ? 'Copied Link' : 'Copy Pass Link'}
                      </button>

                      <a
                        href={verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-200 transition-colors inline-flex items-center gap-1"
                        title="Open pass verification link in new tab"
                      >
                        <ExternalLink className="w-3 h-3 text-blue-600" /> Open Pass
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* LIST TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/90 text-slate-800 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Scheduled Date</th>
                  <th className="px-4 py-3">Card & Holder</th>
                  <th className="px-4 py-3">Contact Person</th>
                  <th className="px-4 py-3">Service Facility Location</th>
                  <th className="px-4 py-3">Requested Services</th>
                  <th className="px-4 py-3">Attached Photos</th>
                  <th className="px-4 py-3 text-right">Pass Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium bg-white">
                {paginatedScheduledCalls.map((item, idx) => {
                  const a = item.availment;
                  const addr = a.address;
                  const formattedAddress = addr
                    ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                    : 'N/A';
                  const verificationUrl = `${window.location.origin}${window.location.pathname}?cardId=${item.cardId}`;
                  const isToday = a.appointmentDate === todayStr;

                  return (
                    <tr key={a.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      {/* Scheduled Date */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-extrabold text-slate-900 text-xs">
                          <Calendar className={`w-3.5 h-3.5 ${isToday ? 'text-amber-600' : 'text-blue-600'}`} />
                          <span>{a.appointmentDate || 'Not specified'}</span>
                        </div>
                        {isToday && (
                          <span className="inline-block mt-0.5 px-2 py-0.2 bg-amber-100 text-amber-900 text-[9px] font-black uppercase rounded border border-amber-300">
                            Today's Call
                          </span>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Booked: {new Date(a.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Card & Holder */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{item.cardTitle}</div>
                        <div className="font-mono text-[11px] text-blue-600 font-semibold">{item.cardCode}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <UserIcon className="w-3 h-3 text-slate-400" />
                          <span>{item.assignedUserName || 'Open / Unassigned'}</span>
                        </div>
                      </td>

                      {/* Contact Person */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">{a.contactPersonName}</div>
                        <div className="text-[11px] text-indigo-700 font-semibold flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-indigo-500" />
                          <span>{a.contactNumber}</span>
                        </div>
                      </td>

                      {/* Service Facility Address */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-1 text-slate-800 max-w-xs">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="font-semibold text-[11px] leading-tight">{formattedAddress}</span>
                        </div>
                      </td>

                      {/* Requested Services */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(a.requestedServices || []).map((svc, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-800 font-bold rounded border border-blue-200"
                            >
                              {svc}
                            </span>
                          ))}
                        </div>
                        {a.remarks && (
                          <div className="text-[10px] text-slate-500 italic mt-1 max-w-xs truncate" title={a.remarks}>
                            "{a.remarks}"
                          </div>
                        )}
                      </td>

                      {/* Attached Photos */}
                      <td className="px-4 py-3.5">
                        {a.photos && a.photos.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {a.photos.slice(0, 2).map((pUrl, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setPreviewImage(pUrl)}
                                className="w-8 h-8 rounded border border-slate-200 overflow-hidden hover:scale-105 transition-transform"
                                title="Click to enlarge photo"
                              >
                                <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                            {a.photos.length > 2 && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-1 rounded">
                                +{a.photos.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No photos</span>
                        )}
                      </td>

                      {/* Quick Pass Link & View Details */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDetailCall(item)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold rounded border border-blue-600 transition-colors inline-flex items-center gap-1 shadow-2xs"
                            title="View full service request details"
                          >
                            <Info className="w-3 h-3" /> Details
                          </button>

                          <button
                            onClick={() => handleCopyLink(item.cardId)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded border border-slate-200 transition-colors inline-flex items-center gap-1"
                            title="Copy Pass Verification Link"
                          >
                            {copiedId === item.cardId ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500" />
                            )}
                            {copiedId === item.cardId ? 'Copied' : 'Copy'}
                          </button>

                          <a
                            href={verificationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded border border-blue-200 transition-colors inline-flex items-center gap-1"
                            title="Open pass verification link in new tab"
                          >
                            <ExternalLink className="w-3 h-3 text-blue-600" /> Open
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 10 Items per page Pagination */}
        <PaginationControls
          currentPage={scheduleCurrentPage}
          totalItems={filteredScheduledCalls.length}
          pageSize={SCHEDULE_PAGE_SIZE}
          onPageChange={setScheduleCurrentPage}
        />
      </div>

      {/* Custom Service Requests & Jobber Approval Overview */}
      <div className="bg-white rounded-2xl border border-purple-200/90 shadow-md overflow-hidden">
        <div className="p-5 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-md text-[10px] font-extrabold uppercase tracking-widest mb-1.5 border border-purple-400/30">
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              Special Custom Service Work Orders
            </div>
            <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Custom Requests & Jobber Approvals
            </h2>
            <p className="text-xs text-purple-200/90 mt-0.5">
              Overview of bespoke service work orders requested on QR passes, showing real-time Jobber approval/decline status and admin schedule date assignment.
            </p>
          </div>

          {/* Filter Toolbar for Custom Requests */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-purple-950/80 p-1 border border-purple-800 rounded-lg text-xs font-semibold text-purple-200">
              <Filter className="w-3.5 h-3.5 text-purple-400 mr-1.5 ml-1" />
              <select
                value={customReqFilter}
                onChange={(e) => {
                  setCustomReqFilter(e.target.value as any);
                  setCustomReqPage(1);
                }}
                className="bg-transparent text-xs text-purple-100 focus:outline-none cursor-pointer font-bold pr-2"
              >
                <option value="all" className="bg-slate-900 text-white">All Custom Requests ({allCustomRequests.length})</option>
                <option value="approved" className="bg-slate-900 text-white">Approved by Jobber ({customApprovedCount})</option>
                <option value="pending" className="bg-slate-900 text-white">Pending Jobber Review ({customPendingCount})</option>
                <option value="rejected" className="bg-slate-900 text-white">Declined by Jobber ({customRejectedCount})</option>
              </select>
            </div>

            {onNavigateSchedule && (
              <button
                type="button"
                onClick={onNavigateSchedule}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Custom Schedule Calendar
              </button>
            )}
          </div>
        </div>

        {/* Custom Requests Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-purple-100/60 border-b border-purple-200">
          <div className="bg-white p-3.5 px-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Custom Orders</span>
              <div className="text-xl font-black text-slate-900">{allCustomRequests.length}</div>
            </div>
            <span className="p-2 bg-purple-50 text-purple-700 rounded-lg font-bold text-xs">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>

          <div className="bg-white p-3.5 px-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Jobber Approved</span>
              <div className="text-xl font-black text-emerald-700">{customApprovedCount}</div>
            </div>
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>

          <div className="bg-white p-3.5 px-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Pending Jobber Review</span>
              <div className="text-xl font-black text-amber-700">{customPendingCount}</div>
            </div>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-lg font-bold text-xs">
              <Clock className="w-4 h-4" />
            </span>
          </div>
        </div>

        {/* Custom Requests Content */}
        {filteredCustomRequests.length === 0 ? (
          <div className="p-10 text-center bg-purple-50/20">
            <Sparkles className="w-10 h-10 text-purple-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No Custom Service Requests Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {customReqFilter !== 'all'
                ? 'No custom requests match your current approval filter.'
                : 'Custom service requests submitted by customers through their QR pass will appear here with real-time Jobber approval statuses.'}
            </p>
          </div>
        ) : (
          <div className="p-5 bg-slate-50/40">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedCustomRequests.map((item, idx) => {
                const a = item.availment;
                const addr = a.address;
                const formattedAddress = addr
                  ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                  : 'N/A';
                const isApproved = a.approvalStatus === 'approved';
                const isRejected = a.approvalStatus === 'rejected';
                const isPending = !isApproved && !isRejected;
                const isScheduled = !!a.appointmentDate;

                return (
                  <div
                    key={a.id || idx}
                    className={`bg-white rounded-xl border p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 ${
                      isApproved
                        ? 'border-emerald-200 ring-1 ring-emerald-500/20'
                        : isRejected
                        ? 'border-rose-200 bg-rose-50/10'
                        : 'border-purple-200 ring-1 ring-purple-400/20'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Status & Date Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs">
                          <Calendar className={`w-3.5 h-3.5 ${isScheduled ? 'text-emerald-600' : 'text-purple-600'}`} />
                          <span>
                            {isScheduled ? a.appointmentDate : (a.targetWeek ? `Target: ${a.targetWeek}` : 'Date unassigned')}
                          </span>
                        </div>

                        {isApproved ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-md border border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Jobber Approved
                          </span>
                        ) : isRejected ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black uppercase rounded-md border border-rose-300 flex items-center gap-1">
                            <X className="w-3 h-3 text-rose-600" />
                            Declined by Jobber
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-[10px] font-black uppercase rounded-md border border-amber-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Pending Jobber Review
                          </span>
                        )}
                      </div>

                      {/* Card & Assigned Jobber Details */}
                      <div>
                        <div className="text-xs font-black text-slate-900">{item.cardTitle}</div>
                        <div className="text-[11px] font-mono font-bold text-purple-700">{item.cardCode}</div>
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-1 font-semibold">
                          <UserIcon className="w-3 h-3 text-purple-600" />
                          <span>Assigned Jobber: {item.assignedUserName || item.assignedUserEmail || 'Unassigned'}</span>
                        </div>
                      </div>

                      {/* Target Week badge if present */}
                      {a.targetWeek && (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                          <Clock className="w-3 h-3 text-indigo-600" />
                          <span>Target Week: {a.targetWeek}</span>
                        </div>
                      )}

                      {/* Custom Requirement Description */}
                      <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200/80 space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-900 block">
                          Custom Service Requirement:
                        </span>
                        <p className="text-xs text-purple-950 font-medium leading-relaxed">
                          {a.customRequestDetails || a.remarks || 'No detailed requirement provided.'}
                        </p>
                      </div>

                      {/* Decision Details if reviewed */}
                      {a.approvalNotes && (
                        <div className={`p-2.5 rounded-lg border text-xs ${
                          isApproved ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' : 'bg-rose-50/80 border-rose-200 text-rose-900'
                        }`}>
                          <div className="font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                            <span>Jobber Response Note:</span>
                          </div>
                          <p className="text-[11px] mt-0.5 italic">"{a.approvalNotes}"</p>
                          {a.approvedAt && (
                            <span className="text-[9px] block text-slate-500 mt-1">
                              Approved on: {new Date(a.approvedAt).toLocaleDateString()}
                            </span>
                          )}
                          {a.rejectedAt && (
                            <span className="text-[9px] block text-slate-500 mt-1">
                              Declined on: {new Date(a.rejectedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Customer Contact & Location */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1 text-xs">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <UserIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{a.contactPersonName || 'N/A'}</span>
                        </div>
                        <div className="text-[11px] font-bold text-indigo-700 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span>{a.contactNumber || 'N/A'}</span>
                        </div>
                        <div className="text-[11px] text-slate-700 flex items-start gap-1.5 pt-1 border-t border-slate-200/60 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span className="font-medium text-[11px] leading-tight">{formattedAddress}</span>
                        </div>
                      </div>

                      {/* Photos */}
                      {a.photos && a.photos.length > 0 && (
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                            Attached Photos ({a.photos.length}):
                          </span>
                          <div className="flex items-center gap-1.5">
                            {a.photos.map((pUrl, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setPreviewImage(pUrl)}
                                className="w-9 h-9 rounded-lg border border-slate-200 overflow-hidden hover:scale-105 transition-transform"
                                title="Click to enlarge"
                              >
                                <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedDetailCall(item)}
                        className="flex-1 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 text-[11px] font-extrabold rounded-lg border border-purple-200 transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5" /> View Details
                      </button>

                      {isApproved && (
                        <button
                          onClick={() => {
                            setScheduleModalItem(item);
                            setScheduleModalDate(a.appointmentDate || new Date().toISOString().split('T')[0]);
                            setScheduleModalTimeSlot(a.appointmentTimeSlot || '09:00 AM - 10:00 AM');
                          }}
                          className={`px-3 py-1.5 text-white text-[11px] font-extrabold rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs ${
                            isScheduled ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          {isScheduled ? 'Reschedule' : 'Schedule Date'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Requests Pagination */}
        <PaginationControls
          currentPage={customReqPage}
          totalItems={filteredCustomRequests.length}
          pageSize={CUSTOM_REQ_PAGE_SIZE}
          onPageChange={setCustomReqPage}
        />
      </div>

      {/* Quick Actions Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">PLS QServe Administration <span className="text-[10px] text-amber-600 uppercase tracking-wider">Prototype v0.1.0</span></h2>
            <p className="text-xs text-slate-500">
              Manage end users, generate QR service passes, and configure weekday schedules.
            </p>
          </div>
          <div className="text-[11px] font-semibold text-slate-400">
                    PLS QServe Digital Platform - Prototype v0.1.0
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={onNavigateQrCards}
            className="p-3.5 bg-blue-50/60 hover:bg-blue-100/60 text-slate-900 font-medium text-xs rounded-xl border border-blue-200/80 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-slate-800">
              <QrCode className="w-4 h-4 text-blue-600" /> Bulk Generate QR Cards
            </span>
            <span className="text-blue-600 font-bold">&rarr;</span>
          </button>

          {onNavigateSchedule && (
            <button
              onClick={onNavigateSchedule}
              className="p-3.5 bg-indigo-50/60 hover:bg-indigo-100/60 text-slate-900 font-medium text-xs rounded-xl border border-indigo-200/80 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2 font-bold text-slate-800">
                <Calendar className="w-4 h-4 text-indigo-600" /> Service Schedule
              </span>
              <span className="text-indigo-600 font-bold">&rarr;</span>
            </button>
          )}

          <button
            onClick={onNavigateManagedUsers}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 text-slate-900 font-medium text-xs rounded-xl border border-slate-200 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-slate-800">
              <UserCheck className="w-4 h-4 text-slate-600" /> Manage End Users
            </span>
            <span className="text-slate-400">&rarr;</span>
          </button>

          <button
            onClick={onNavigateProfile}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 text-slate-900 font-medium text-xs rounded-xl border border-slate-200 flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-slate-600" /> Security Settings
            </span>
            <span className="text-slate-400">&rarr;</span>
          </button>
        </div>
      </div>

      {/* Detailed Service Call Modal */}
      {selectedDetailCall && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900">Scheduled Service Request</h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${
                        selectedDetailCall.availment.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {selectedDetailCall.availment.status || 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    REQ #{selectedDetailCall.availment.id} • Pass Code:{' '}
                    <strong className="font-mono text-blue-600">{selectedDetailCall.cardCode}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailCall(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Scheduled Time & Pass Holder */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                  Appointment & Pass Info
                </span>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{selectedDetailCall.availment.appointmentDate}</span>
                </div>
                <div className="text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                  <strong>Card Title:</strong> {selectedDetailCall.cardTitle}
                </div>
                {selectedDetailCall.assignedUserName && (
                  <div className="text-xs text-slate-600">
                    <strong>Assigned Holder:</strong> {selectedDetailCall.assignedUserName} ({selectedDetailCall.assignedUserEmail || 'N/A'})
                  </div>
                )}
                <div className="text-[10px] text-slate-400">
                  Booked On: {new Date(selectedDetailCall.availment.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Box 2: Contact Information */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                  Contact Information
                </span>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <UserIcon className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{selectedDetailCall.availment.contactPersonName || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <a href={`tel:${selectedDetailCall.availment.contactNumber}`} className="hover:underline">
                    {selectedDetailCall.availment.contactNumber || 'N/A'}
                  </a>
                </div>
              </div>

              {/* Box 3: Address */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" /> Service Location Address
                </span>
                <div className="text-xs font-bold text-slate-900 leading-snug">
                  {selectedDetailCall.availment.address.streetAddress}
                  {selectedDetailCall.availment.address.aptSuite ? `, ${selectedDetailCall.availment.address.aptSuite}` : ''}
                </div>
                <div className="text-xs text-slate-600">
                  {selectedDetailCall.availment.address.city}, {selectedDetailCall.availment.address.state} {selectedDetailCall.availment.address.zipCode}
                </div>
              </div>

              {/* Box 4: Requested Services */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 space-y-2 md:col-span-2">
                <span className="text-[10px] font-extrabold uppercase text-blue-800 block tracking-wider">
                  Requested Services ({selectedDetailCall.availment.requestedServices.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDetailCall.availment.requestedServices.map((svc, sIdx) => (
                    <span
                      key={sIdx}
                      className="px-2.5 py-1 bg-white text-blue-900 text-xs font-extrabold rounded-lg border border-blue-300 shadow-2xs"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>

              {/* Box 5: Remarks */}
              {selectedDetailCall.availment.remarks && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 block tracking-wider">
                    Customer Remarks / Special Instructions
                  </span>
                  <p className="text-xs text-slate-800 italic bg-white p-2.5 rounded-lg border border-slate-200">
                    "{selectedDetailCall.availment.remarks}"
                  </p>
                </div>
              )}

              {/* Box 6: Attached Photos */}
              {selectedDetailCall.availment.photos && selectedDetailCall.availment.photos.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 block tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Customer Attached Photos ({selectedDetailCall.availment.photos.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedDetailCall.availment.photos.map((pUrl, pIdx) => (
                      <button
                        type="button"
                        key={pIdx}
                        onClick={() => setPreviewImage(pUrl)}
                        className="w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 hover:border-blue-500 transition-all relative group shadow-2xs"
                      >
                        <img src={pUrl} alt={`Attachment ${pIdx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                          Enlarge
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Box 7: Admin Completion Photos */}
              {selectedDetailCall.availment.completionPhotos && selectedDetailCall.availment.completionPhotos.length > 0 && (
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 space-y-2 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-emerald-800 block tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Admin Completion Proof Photos ({selectedDetailCall.availment.completionPhotos.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedDetailCall.availment.completionPhotos.map((cPhoto, cIdx) => (
                      <button
                        type="button"
                        key={cIdx}
                        onClick={() => setPreviewImage(cPhoto)}
                        className="w-16 h-16 rounded-xl overflow-hidden border-2 border-emerald-300 hover:border-emerald-600 transition-all relative group shadow-2xs"
                      >
                        <img src={cPhoto} alt={`Proof ${cIdx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-emerald-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                          Enlarge
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedDetailCall.availment.completedAt && (
                    <p className="text-[10px] text-emerald-700 font-bold">
                      Completed on: {new Date(selectedDetailCall.availment.completedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-3">
              {onNavigateSchedule ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDetailCall(null);
                    onNavigateSchedule();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Calendar className="w-4 h-4" /> Go To Service Schedule
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setSelectedDetailCall(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Schedule Custom Request Modal */}
      {scheduleModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-800">
                  <Sparkles className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">Schedule Custom Service Date</h3>
                  <p className="text-[11px] text-slate-500">Pass: {scheduleModalItem.cardCode}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Summary */}
            <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3 space-y-1.5 text-xs text-purple-950">
              <div className="font-bold flex items-center justify-between">
                <span>{scheduleModalItem.availment.contactPersonName || 'Customer'}</span>
                <span className="text-[10px] font-mono bg-purple-200/60 text-purple-900 px-2 py-0.5 rounded">
                  {scheduleModalItem.availment.contactNumber || 'No Phone'}
                </span>
              </div>
              {scheduleModalItem.availment.targetWeek && (
                <p className="text-[11px] font-bold text-indigo-700">
                  Requested Target Week: {scheduleModalItem.availment.targetWeek}
                </p>
              )}
              <p className="text-[11px] text-slate-600 line-clamp-2">
                {scheduleModalItem.availment.customRequestDetails || 'No additional details provided.'}
              </p>
            </div>

            {/* Scheduling Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!scheduleModalDate) {
                  alert('Please choose a valid service date.');
                  return;
                }
                setScheduleModalSubmitting(true);
                try {
                  await updateAvailmentScheduleDate(
                    scheduleModalItem.cardCode,
                    scheduleModalItem.availment.id,
                    scheduleModalDate,
                    scheduleModalTimeSlot,
                    authUser?.email || 'admin@plsqserve.com'
                  );
                  onScheduleAvailment?.(
                    scheduleModalItem.cardCode,
                    scheduleModalItem.availment.id,
                    scheduleModalDate,
                    scheduleModalTimeSlot
                  );
                  onSuccessToast?.(`Scheduled service date set to ${scheduleModalDate} (${scheduleModalTimeSlot}).`);
                  setScheduleModalItem(null);
                } catch (err: any) {
                  alert(err.message || 'Failed to update schedule date.');
                } finally {
                  setScheduleModalSubmitting(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  Assigned Service Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={scheduleModalDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduleModalDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  Service Time Window
                </label>
                <select
                  value={scheduleModalTimeSlot}
                  onChange={(e) => setScheduleModalTimeSlot(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="09:00 AM - 10:00 AM">09:00 AM - 10:00 AM</option>
                  <option value="10:00 AM - 11:00 AM">10:00 AM - 11:00 AM</option>
                  <option value="11:00 AM - 12:00 PM">11:00 AM - 12:00 PM</option>
                  <option value="01:00 PM - 02:00 PM">01:00 PM - 02:00 PM</option>
                  <option value="02:00 PM - 03:00 PM">02:00 PM - 03:00 PM</option>
                  <option value="03:00 PM - 04:00 PM">03:00 PM - 04:00 PM</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setScheduleModalItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleModalSubmitting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {scheduleModalSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-3.5 h-3.5" />
                      Confirm Schedule
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Modal Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden p-2 shadow-2xl">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black text-white p-2 rounded-full z-10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewImage} alt="Enlarged attachment" className="w-full max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
};

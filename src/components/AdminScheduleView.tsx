import React, { useState, useEffect, useMemo } from 'react';
import { AdminSchedule, InAppNotification, QrCard } from '../types';
import {
  getAdminSchedule,
  saveAdminSchedule,
  getAdminBookedCountsByDate,
  getAdminBookedRequestsByDate,
  updateServiceRequestCompletion,
  updateAvailmentScheduleDate,
  BookedRequestItem
} from '../lib/userService';
import { compressImage } from '../lib/imageUtils';
import { PaginationControls } from './PaginationControls';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  CalendarDays,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Slash,
  AlertCircle,
  Phone,
  User,
  MapPin,
  FileText,
  ListFilter,
  Camera,
  Image as ImageIcon,
  X,
  Upload,
  Eye,
  AlertTriangle,
  Check,
  LayoutGrid,
  List,
  Download,
  RefreshCw
} from 'lucide-react';

interface AdminScheduleViewProps {
  currentAdminUid: string;
  qrCards?: QrCard[];
  onUpdateCardAvailment?: (cardCode: string, availmentId: string, status: string, photos: string[]) => void;
  onScheduleAvailment?: (cardCode: string, availmentId: string, appointmentDate: string, appointmentTimeSlot?: string) => void;
  notificationTarget?: InAppNotification | null;
  onNotificationTargetHandled?: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const ALL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const ALL_DAYS_LIST = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULT_TIME_SLOTS = [
  '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '01:00 PM - 02:00 PM',
  '02:00 PM - 03:00 PM',
  '03:00 PM - 04:00 PM'
];

export const AdminScheduleView: React.FC<AdminScheduleViewProps> = ({
  currentAdminUid,
  qrCards,
  onUpdateCardAvailment,
  onScheduleAvailment,
  notificationTarget,
  onNotificationTargetHandled,
  onSuccess,
  onError
}) => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(now.getMonth());

  const monthKey = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Schedule configuration states
  const [enabledWeekdays, setEnabledWeekdays] = useState<string[]>(ALL_WEEKDAYS);
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
  const [newTimeSlotInput, setNewTimeSlotInput] = useState<string>('');
  const [maxBookingsPerSlot, setMaxBookingsPerSlot] = useState<number>(5);
  const [maxBookingsPerDay, setMaxBookingsPerDay] = useState<number>(2); // Default 2 total service calls per day
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [fetchedBookedCounts, setFetchedBookedCounts] = useState<Record<string, number>>({});
  const [fetchedBookedRequests, setFetchedBookedRequests] = useState<Record<string, BookedRequestItem[]>>({});
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<'all' | 'standard' | 'custom'>('all');
  const [serviceCallViewMode, setServiceCallViewMode] = useState<'card' | 'list'>('list');
  const [scheduleListPage, setScheduleListPage] = useState<number>(1);
  const SCHEDULE_PAGE_SIZE = 10;
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedDetailedRequest, setSelectedDetailedRequest] = useState<BookedRequestItem | null>(null);
  const [activeScheduleTab, setActiveScheduleTab] = useState<'standard' | 'custom'>('standard');
  const handledNotificationId = React.useRef<string | null>(null);

  // Schedule Custom Request Modal State
  const [scheduleCustomModalItem, setScheduleCustomModalItem] = useState<BookedRequestItem | null>(null);
  const [scheduleCustomDate, setScheduleCustomDate] = useState<string>('');
  const [scheduleCustomTimeSlot, setScheduleCustomTimeSlot] = useState<string>('09:00 AM - 10:00 AM');
  const [schedulingCustomSubmitting, setSchedulingCustomSubmitting] = useState<boolean>(false);

  // All custom requests across qrCards
  const allCustomRequests = useMemo(() => {
    const list: BookedRequestItem[] = [];
    if (!qrCards) return list;
    for (const card of qrCards) {
      if (card.availments && card.availments.length > 0) {
        for (const availment of card.availments) {
          if (availment.isCustomRequest) {
            list.push({
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
    // Sort latest request as default
    return list.sort((a, b) => new Date(b.availment.timestamp || 0).getTime() - new Date(a.availment.timestamp || 0).getTime());
  }, [qrCards]);

  const rejectedCustomRequests = useMemo(
    () => allCustomRequests.filter((item) => item.availment.approvalStatus === 'rejected'),
    [allCustomRequests]
  );

  // All standard requests across qrCards
  const allStandardRequests = useMemo(() => {
    const list: BookedRequestItem[] = [];
    if (!qrCards) return list;
    for (const card of qrCards) {
      if (card.availments && card.availments.length > 0) {
        for (const availment of card.availments) {
          if (!availment.isCustomRequest) {
            list.push({
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
    // Sort latest request as default
    return list.sort((a, b) => new Date(b.availment.timestamp || 0).getTime() - new Date(a.availment.timestamp || 0).getTime());
  }, [qrCards]);

  useEffect(() => {
    if (!notificationTarget) return;
    if (handledNotificationId.current === notificationTarget.id) return;
    const isCustomNotification = notificationTarget.type === 'custom_request_created' ||
      notificationTarget.type === 'custom_request_approved' ||
      notificationTarget.type === 'custom_request_rejected';
    const requests = isCustomNotification ? allCustomRequests : allStandardRequests;
    const request = requests.find(
      (item) => item.cardCode === notificationTarget.cardCode && item.availment.id === notificationTarget.availmentId
    );
    if (request) {
      handledNotificationId.current = notificationTarget.id;
      setActiveScheduleTab(request.availment.isCustomRequest ? 'custom' : 'standard');
      setSelectedDetailedRequest(request);
      onNotificationTargetHandled?.();
    }
  }, [notificationTarget, allCustomRequests, allStandardRequests, onNotificationTargetHandled]);

  const approvedCustomAwaitingScheduling = useMemo(() => {
    return allCustomRequests.filter(
      (item) => item.availment.approvalStatus === 'approved' && !item.availment.appointmentDate
    ).sort((a, b) => new Date(b.availment.timestamp || 0).getTime() - new Date(a.availment.timestamp || 0).getTime());
  }, [allCustomRequests]);

  const standardAwaitingScheduling = useMemo(() => {
    return allStandardRequests.filter(
      (item) => !item.availment.appointmentDate
    ).sort((a, b) => new Date(b.availment.timestamp || 0).getTime() - new Date(a.availment.timestamp || 0).getTime());
  }, [allStandardRequests]);

  // Derive booked counts & requests in-memory from qrCards prop if provided (0 reads)
  const { bookedCounts, bookedRequests, standardCounts, customCounts } = useMemo(() => {
    const stdCounts: Record<string, number> = {};
    const cstCounts: Record<string, number> = {};

    if (qrCards && qrCards.length >= 0) {
      const counts: Record<string, number> = {};
      const requests: Record<string, BookedRequestItem[]> = {};

      for (const card of qrCards) {
        if (card.availments && card.availments.length > 0) {
          for (const availment of card.availments) {
            if (availment.appointmentDate && !(availment.isCustomRequest && availment.approvalStatus === 'rejected')) {
              const dateKey = availment.appointmentDate;
              counts[dateKey] = (counts[dateKey] || 0) + 1;
              if (availment.isCustomRequest) {
                cstCounts[dateKey] = (cstCounts[dateKey] || 0) + 1;
              } else {
                stdCounts[dateKey] = (stdCounts[dateKey] || 0) + 1;
              }

              if (!requests[dateKey]) {
                requests[dateKey] = [];
              }
              requests[dateKey].push({
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
      return {
        bookedCounts: counts,
        bookedRequests: requests,
        standardCounts: stdCounts,
        customCounts: cstCounts
      };
    }

    // From fetched requests
    for (const [dateKey, reqList] of Object.entries(fetchedBookedRequests)) {
      for (const req of reqList) {
        if (req.availment?.isCustomRequest) {
          cstCounts[dateKey] = (cstCounts[dateKey] || 0) + 1;
        } else {
          stdCounts[dateKey] = (stdCounts[dateKey] || 0) + 1;
        }
      }
    }

    return {
      bookedCounts: fetchedBookedCounts,
      bookedRequests: fetchedBookedRequests,
      standardCounts: stdCounts,
      customCounts: cstCounts
    };
  }, [qrCards, fetchedBookedCounts, fetchedBookedRequests]);

  // Completion Photo Upload Modal State
  const [completingItem, setCompletingItem] = useState<BookedRequestItem | null>(null);
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [submittingCompletion, setSubmittingCompletion] = useState<boolean>(false);

  const refreshBookings = async () => {
    if (qrCards) return;
    try {
      const [counts, requests] = await Promise.all([
        getAdminBookedCountsByDate(currentAdminUid),
        getAdminBookedRequestsByDate(currentAdminUid)
      ]);
      setFetchedBookedCounts(counts);
      setFetchedBookedRequests(requests);
    } catch (err) {
      console.error('Error refreshing bookings:', err);
    }
  };

  const handleUploadCompletionPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(async (file) => {
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
      }
      try {
        const compressed = await compressImage(file, 1000, 1000, 0.7);
        setCompletionPhotos((prev) => [...prev, compressed]);
      } catch (err) {
        console.error('Error compressing image:', err);
        alert('Failed to process image file.');
      }
    });
    e.target.value = '';
  };

  const handleRemoveCompletionPhoto = (idx: number) => {
    setCompletionPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmCompletion = async () => {
    if (!completingItem) return;
    if (completionPhotos.length === 0) {
      alert('You must upload at least 1 completed photo to complete this service request.');
      return;
    }

    setSubmittingCompletion(true);
    try {
      await updateServiceRequestCompletion(
        completingItem.cardCode,
        completingItem.availment.id,
        {
          status: 'completed',
          completionPhotos
        }
      );
      if (onUpdateCardAvailment) {
        onUpdateCardAvailment(
          completingItem.cardCode,
          completingItem.availment.id,
          'completed',
          completionPhotos
        );
      }
      onSuccess(`Service Request #${completingItem.availment.id} successfully completed with uploaded proof photo!`);
      setCompletingItem(null);
      setCompletionPhotos([]);
      await refreshBookings();
    } catch (err: any) {
      console.error('Error completing service request:', err);
      onError(err.message || 'Failed to complete service request.');
    } finally {
      setSubmittingCompletion(false);
    }
  };

  // Load schedule and bookings for selected month
  useEffect(() => {
    async function loadSchedule() {
      setLoading(true);
      try {
        const schedulePromise = getAdminSchedule(currentAdminUid, monthKey);
        const countsPromise = qrCards ? Promise.resolve(null) : getAdminBookedCountsByDate(currentAdminUid);
        const requestsPromise = qrCards ? Promise.resolve(null) : getAdminBookedRequestsByDate(currentAdminUid);

        const [schedule, counts, requests] = await Promise.all([
          schedulePromise,
          countsPromise,
          requestsPromise
        ]);

        if (counts) setFetchedBookedCounts(counts);
        if (requests) setFetchedBookedRequests(requests);

        if (schedule) {
          setEnabledWeekdays(schedule.enabledWeekdays || ALL_WEEKDAYS);
          setTimeSlots(schedule.timeSlots || DEFAULT_TIME_SLOTS);
          setMaxBookingsPerSlot(schedule.maxBookingsPerSlot ?? 5);
          setMaxBookingsPerDay(schedule.maxBookingsPerDay ?? 2);
          setBlockedDates(schedule.blockedDates || []);
        } else {
          // Defaults for new month
          setEnabledWeekdays(ALL_WEEKDAYS);
          setTimeSlots(DEFAULT_TIME_SLOTS);
          setMaxBookingsPerSlot(5);
          setMaxBookingsPerDay(2);
          setBlockedDates([]);
        }
      } catch (err: any) {
        console.error('Error loading schedule:', err);
        onError('Failed to load admin schedule from database.');
      } finally {
        setLoading(false);
      }
    }

    if (currentAdminUid) {
      loadSchedule();
    }
  }, [currentAdminUid, monthKey, qrCards]);

  const handleMonthPrev = () => {
    if (selectedMonthIndex === 0) {
      setSelectedMonthIndex(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonthIndex((prev) => prev - 1);
    }
  };

  const handleMonthNext = () => {
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonthIndex((prev) => prev + 1);
    }
  };

  const toggleWeekday = (day: string) => {
    if (enabledWeekdays.includes(day)) {
      setEnabledWeekdays(enabledWeekdays.filter((d) => d !== day));
    } else {
      setEnabledWeekdays([...enabledWeekdays, day]);
    }
  };

  const handleSelectAllWeekdays = () => {
    setEnabledWeekdays([...ALL_WEEKDAYS]);
  };

  const handleClearWeekdays = () => {
    setEnabledWeekdays([]);
  };

  const handleAddTimeSlot = () => {
    if (!newTimeSlotInput.trim()) return;
    const formatted = newTimeSlotInput.trim();
    if (timeSlots.includes(formatted)) {
      alert('This time slot is already added.');
      return;
    }
    setTimeSlots([...timeSlots, formatted]);
    setNewTimeSlotInput('');
  };

  const handleRemoveTimeSlot = (slot: string) => {
    setTimeSlots(timeSlots.filter((s) => s !== slot));
  };

  const applyTimeSlotPreset = (preset: 'standard' | 'morning' | 'afternoon') => {
    if (preset === 'standard') {
      setTimeSlots([
        '09:00 AM - 10:00 AM',
        '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM',
        '01:00 PM - 02:00 PM',
        '02:00 PM - 03:00 PM',
        '04:00 PM - 05:00 PM'
      ]);
    } else if (preset === 'morning') {
      setTimeSlots([
        '08:00 AM - 09:00 AM',
        '09:00 AM - 10:00 AM',
        '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM'
      ]);
    } else if (preset === 'afternoon') {
      setTimeSlots([
        '01:00 PM - 02:00 PM',
        '02:00 PM - 03:00 PM',
        '03:00 PM - 04:00 PM',
        '04:00 PM - 05:00 PM'
      ]);
    }
  };

  const toggleBlockedDate = async (dateStr: string) => {
    const updatedBlocked = blockedDates.includes(dateStr)
      ? blockedDates.filter((d) => d !== dateStr)
      : [...blockedDates, dateStr];
    setBlockedDates(updatedBlocked);

    // Persist immediately so end users immediately see blocked date
    try {
      await saveAdminSchedule(currentAdminUid, monthKey, {
        enabledWeekdays,
        timeSlots,
        maxBookingsPerSlot,
        maxBookingsPerDay,
        blockedDates: updatedBlocked
      });
      if (updatedBlocked.includes(dateStr)) {
        onSuccess(`Date ${dateStr} is now blocked from QR bookings.`);
      } else {
        onSuccess(`Date ${dateStr} is now unblocked.`);
      }
    } catch (e: any) {
      console.warn('Auto-save blocked date warning:', e);
    }
  };

  const handleExportScheduleCallsCSV = (requestsToExport: BookedRequestItem[]) => {
    if (requestsToExport.length === 0) {
      alert('No service call records available to export.');
      return;
    }

    const headers = [
      'Service Request ID',
      'Appointment Date',
      'Availed Date & Time',
      'Service Status',
      'Is Custom Request',
      'Custom Request Details',
      'Jobber Approval Status',
      'Approval Response Notes',
      'Card Code',
      'Card Title',
      'Assigned User / Holder',
      'Assigned Email',
      'Contact Person Name',
      'Contact Phone Number',
      'Street Address',
      'Apt / Suite',
      'City',
      'State',
      'Zip Code',
      'Full Service Address',
      'Requested Services',
      'Customer Remarks / Notes',
      'Customer Photos Count',
      'Completed Date & Time',
      'Admin Proof Photos Count'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = requestsToExport.map((req) => {
      const a = req.availment;
      const addr = a.address;
      const fullAddr = addr
        ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
        : '';

      return [
        escapeCsv(a.id),
        escapeCsv(a.appointmentDate || ''),
        escapeCsv(a.timestamp ? new Date(a.timestamp).toLocaleString() : ''),
        escapeCsv(a.status || 'pending'),
        escapeCsv(a.isCustomRequest ? 'YES' : 'NO'),
        escapeCsv(a.customRequestDetails || ''),
        escapeCsv(a.approvalStatus || (a.isCustomRequest ? 'pending_approval' : 'N/A')),
        escapeCsv(a.approvalNotes || ''),
        escapeCsv(req.cardCode || ''),
        escapeCsv(req.cardTitle || ''),
        escapeCsv(req.assignedUserName || 'Unassigned'),
        escapeCsv(req.assignedUserEmail || ''),
        escapeCsv(a.contactPersonName || ''),
        escapeCsv(a.contactNumber || ''),
        escapeCsv(addr?.streetAddress || ''),
        escapeCsv(addr?.aptSuite || ''),
        escapeCsv(addr?.city || ''),
        escapeCsv(addr?.state || ''),
        escapeCsv(addr?.zipCode || ''),
        escapeCsv(fullAddr),
        escapeCsv((a.requestedServices || []).join('; ')),
        escapeCsv(a.remarks || ''),
        escapeCsv(a.photos ? a.photos.length : 0),
        escapeCsv(a.completedAt || ''),
        escapeCsv(a.completionPhotos ? a.completionPhotos.length : 0)
      ].join(',');
    });

    const csvString = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PLS_Scheduled_Service_Calls_${monthKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onSuccess(`Successfully exported ${requestsToExport.length} scheduled service calls to CSV!`);
  };

  const handleSaveSchedule = async () => {
    if (enabledWeekdays.length === 0) {
      alert('Please select at least one active weekday.');
      return;
    }

    setSaving(true);
    try {
      await saveAdminSchedule(currentAdminUid, monthKey, {
        enabledWeekdays,
        timeSlots,
        maxBookingsPerSlot,
        maxBookingsPerDay,
        blockedDates
      });
      onSuccess(`Schedule & availability for ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear} saved successfully!`);
    } catch (err: any) {
      console.error('Error saving schedule:', err);
      onError(err.message || 'Failed to save schedule settings.');
    } finally {
      setSaving(false);
    }
  };

  // Build Calendar Days for Selected Month
  const firstDayOfWeek = new Date(selectedYear, selectedMonthIndex, 1).getDay(); // 0 = Sun, 1 = Mon, ...
  const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
  const calendarDays: Array<{
    dateNumber: number;
    dateStr: string;
    dayName: string;
    isWeekday: boolean;
    isAvailableWeekday: boolean;
    isBlocked: boolean;
  }> = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const dateObj = new Date(selectedYear, selectedMonthIndex, i);
    const dateStr = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const isWeekday = dayName !== 'Saturday' && dayName !== 'Sunday';
    const isAvailableWeekday = enabledWeekdays.includes(dayName);
    const isBlocked = blockedDates.includes(dateStr);

    calendarDays.push({
      dateNumber: i,
      dateStr,
      dayName,
      isWeekday,
      isAvailableWeekday,
      isBlocked
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Admin Service Schedule & Weekday Availability
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure month-wise weekday availability and time slots for QR service requests.
          </p>
        </div>

        <button
          onClick={handleSaveSchedule}
          disabled={saving || loading}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
        >
          {saving ? (
            <span>Saving Schedule...</span>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Schedule ({MONTH_NAMES[selectedMonthIndex]} {selectedYear})
            </>
          )}
        </button>
      </div>

      {/* MONTH SELECTOR BAR */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-md flex items-center justify-between">
        <button
          type="button"
          onClick={handleMonthPrev}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
        >
          <ChevronLeft className="w-4 h-4" /> Previous Month
        </button>

        <div className="text-center">
          <span className="text-[10px] uppercase font-extrabold text-blue-400 tracking-widest block">
            SELECTED MONTHLY SCHEDULE
          </span>
          <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
            {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
          </h2>
        </div>

        <button
          type="button"
          onClick={handleMonthNext}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
        >
          Next Month <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* SCHEDULE CALENDAR MODE TABS: Standard Calls vs Custom Requests Calendar */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl border border-slate-300 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => {
            setActiveScheduleTab('standard');
            setServiceTypeFilter('all');
          }}
          className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeScheduleTab === 'standard'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Standard Service Calls Calendar</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeScheduleTab === 'standard' ? 'bg-blue-800 text-white' : 'bg-slate-300 text-slate-700'
          }`}>
            {Object.values(standardCounts).reduce((a, b) => a + b, 0)} Calls
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveScheduleTab('custom');
            setServiceTypeFilter('custom');
          }}
          className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeScheduleTab === 'custom'
              ? 'bg-purple-700 text-white shadow-md'
              : 'text-purple-900 hover:text-purple-950 hover:bg-purple-100/60'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Custom Service Calendar</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeScheduleTab === 'custom' ? 'bg-purple-900 text-white' : 'bg-purple-200 text-purple-800'
          }`}>
            {Object.values(customCounts).reduce((a, b) => a + b, 0)} Scheduled
          </span>
        </button>
      </div>

      {/* Standard Requests Awaiting Date Scheduling (Shown on Standard Tab) */}
      {activeScheduleTab === 'standard' && standardAwaitingScheduling.length > 0 && (
        <div className="bg-white rounded-2xl border border-blue-300 shadow-md p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-100 text-blue-700 font-black">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Standard Service Requests Awaiting Date Scheduling
                </h3>
                <p className="text-xs text-slate-500">
                  Customer requested service calls awaiting Admin calendar appointment date assignment.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full font-black text-xs self-start sm:self-auto border border-blue-200">
              {standardAwaitingScheduling.length} Ready to Schedule
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {standardAwaitingScheduling.map((item, idx) => {
              const a = item.availment;
              return (
                <div
                  key={a.id || idx}
                  className="bg-blue-50/40 rounded-xl border border-blue-200 p-3.5 space-y-2.5 flex flex-col justify-between hover:border-blue-400 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded">
                        {item.cardCode}
                      </span>
                      <span className="text-[10px] font-black text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        Service Requested
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900">{item.cardTitle}</h4>
                      <p className="text-[11px] text-slate-600 font-semibold mt-0.5">
                        Customer: {a.contactPersonName} ({a.contactNumber})
                      </p>
                      {a.contactEmail && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          Email: {a.contactEmail}
                        </p>
                      )}
                    </div>

                    {a.targetWeek && (
                      <div className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-indigo-600" />
                        <span>Target Week: {a.targetWeek}</span>
                      </div>
                    )}

                    {a.requestedServices && a.requestedServices.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {a.requestedServices.map((svc, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 bg-white border border-blue-200 text-blue-900 rounded font-semibold text-[10px]"
                          >
                            {svc}
                          </span>
                        ))}
                      </div>
                    )}

                    {a.remarks && (
                      <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-blue-100 line-clamp-2">
                        {a.remarks}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setScheduleCustomModalItem(item);
                      setScheduleCustomDate(new Date().toISOString().split('T')[0]);
                      setScheduleCustomTimeSlot('09:00 AM - 10:00 AM');
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Assign Service Date
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approved Custom Requests Awaiting Date Scheduling (Shown on Custom Tab) */}
      {activeScheduleTab === 'custom' && approvedCustomAwaitingScheduling.length > 0 && (
        <div className="bg-white rounded-2xl border border-purple-300 shadow-md p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700 font-black">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Approved Custom Requests Ready for Date Scheduling
                </h3>
                <p className="text-xs text-slate-500">
                  These custom orders have been approved by the Jobber and are awaiting Admin appointment date assignment.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-900 rounded-full font-black text-xs self-start sm:self-auto border border-purple-200">
              {approvedCustomAwaitingScheduling.length} Ready to Schedule
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {approvedCustomAwaitingScheduling.map((item, idx) => {
              const a = item.availment;
              return (
                <div
                  key={a.id || idx}
                  className="bg-purple-50/50 rounded-xl border border-purple-200 p-3.5 space-y-2.5 flex flex-col justify-between hover:border-purple-400 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded">
                        {item.cardCode}
                      </span>
                      <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Jobber Approved
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900">{item.cardTitle}</h4>
                      <p className="text-[11px] text-slate-600 font-semibold mt-0.5">
                        Customer: {a.contactPersonName} ({a.contactNumber})
                      </p>
                    </div>

                    {a.targetWeek && (
                      <div className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-indigo-600" />
                        <span>Target: {a.targetWeek}</span>
                      </div>
                    )}

                    <p className="text-xs text-purple-950 bg-white p-2 rounded-lg border border-purple-100 line-clamp-2">
                      {a.customRequestDetails || a.remarks || 'No detailed requirement provided.'}
                    </p>

                    {a.approvalNotes && (
                      <p className="text-[10px] text-emerald-800 italic bg-emerald-50/80 p-1.5 rounded border border-emerald-200">
                        Jobber Note: "{a.approvalNotes}"
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setScheduleCustomModalItem(item);
                      setScheduleCustomDate(new Date().toISOString().split('T')[0]);
                      setScheduleCustomTimeSlot('09:00 AM - 10:00 AM');
                    }}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Assign Service Date
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 text-xs font-bold animate-pulse">
          Loading schedule settings for {MONTH_NAMES[selectedMonthIndex]} {selectedYear}...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Weekdays & Time Slots Configuration */}
          <div className="lg:col-span-6 space-y-6">
            {/* 1. WEEKDAYS SELECTION (MON-FRI) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Active Weekdays for {MONTH_NAMES[selectedMonthIndex]}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={handleSelectAllWeekdays}
                    className="text-blue-600 hover:underline"
                  >
                    Select Mon-Fri
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleClearWeekdays}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ALL_DAYS_LIST.map((day) => {
                  const isChecked = enabledWeekdays.includes(day);
                  const isWeekend = day === 'Saturday' || day === 'Sunday';

                  return (
                    <button
                      type="button"
                      key={day}
                      onClick={() => toggleWeekday(day)}
                      className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                        isChecked
                          ? 'bg-blue-50 text-blue-900 border-blue-400 ring-2 ring-blue-500/20 shadow-2xs'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span>{day}</span>
                      </span>
                      {isWeekend && (
                        <span className="text-[9px] font-extrabold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          WEND
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  QR service requests will only allow booking dates on the enabled weekdays for this month.
                </span>
              </div>
            </div>

            {/* 2. DAILY SERVICE CALL QUOTA */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Daily Service Call Quota
                  </h3>
                </div>
              </div>

              {/* Max Bookings per Day setting */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-900">
                      Daily Max Service Calls Quota (Total Calls / Day)
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Maximum total service calls allowed on any single date (Default: 2)
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxBookingsPerDay}
                    onChange={(e) => setMaxBookingsPerDay(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 bg-blue-50 border border-blue-300 rounded-lg text-xs font-black text-blue-900 text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive Monthly Calendar & Date Blocked Overrides */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Month Calendar View ({MONTH_NAMES[selectedMonthIndex]} {selectedYear})
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  Click a date to block/unblock
                </span>
              </div>

              <div className="text-xs text-slate-500 leading-relaxed">
                Dates highlighted in <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Green</span> represent available weekdays. You can click on any individual date to toggle it as a <span className="font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">Blocked Holiday</span>.
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="font-extrabold text-slate-400 uppercase text-[10px] py-1">
                    {d}
                  </div>
                ))}

                {/* Blank cells for offset before 1st day of month */}
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="p-2 min-h-[52px] bg-slate-50/50 rounded-xl border border-dashed border-slate-100" />
                ))}

                {calendarDays.map((cd) => {
                  const isAvailable = cd.isAvailableWeekday && !cd.isBlocked;
                  const reqCount = bookedCounts[cd.dateStr] || 0;
                  const stdCount = standardCounts[cd.dateStr] || 0;
                  const cstCount = customCounts[cd.dateStr] || 0;
                  const isSelectedForFilter = selectedDateFilter === cd.dateStr;

                  return (
                    <button
                      type="button"
                      key={cd.dateStr}
                      onClick={() => toggleBlockedDate(cd.dateStr)}
                      className={`p-2 rounded-xl text-xs font-extrabold border transition-all flex flex-col items-center justify-between min-h-[68px] relative ${
                        cd.isBlocked
                          ? 'bg-red-50 text-red-700 border-red-300 line-through ring-2 ring-red-400/20'
                          : isAvailable
                          ? activeScheduleTab === 'custom' && cstCount > 0
                            ? 'bg-purple-50 text-purple-950 border-purple-300 ring-2 ring-purple-400/30 hover:bg-purple-100 shadow-2xs'
                            : 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                          : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'
                      } ${isSelectedForFilter ? 'ring-2 ring-blue-600' : ''}`}
                      title={
                        cd.isBlocked
                          ? `${cd.dateStr}: Blocked Holiday (Click to unblock)`
                          : isAvailable
                          ? `${cd.dateStr}: Available Weekday (${reqCount} total calls, ${stdCount} standard, ${cstCount} custom. Click to block date)`
                          : `${cd.dateStr}: Unavailable Day`
                      }
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{cd.dateNumber}</span>
                        {reqCount > 0 && (
                          <div className="flex items-center gap-0.5">
                            {cstCount > 0 && (
                              <span className="bg-purple-600 text-white font-extrabold text-[8px] px-1 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs" title={`${cstCount} Custom Request(s)`}>
                                ✨{cstCount}
                              </span>
                            )}
                            {stdCount > 0 && (
                              <span className="bg-blue-600 text-white font-extrabold text-[8px] px-1 py-0.5 rounded-full flex items-center gap-0.5 shadow-2xs" title={`${stdCount} Standard Call(s)`}>
                                📞{stdCount}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] font-normal leading-none mt-1">
                        {cd.isBlocked ? (
                          <span className="text-red-600 font-bold">BLOCKED</span>
                        ) : isAvailable ? (
                          <span className={activeScheduleTab === 'custom' && cstCount > 0 ? 'text-purple-700 font-bold' : 'text-emerald-700 font-bold'}>
                            {activeScheduleTab === 'custom' && cstCount > 0 ? 'CUSTOM' : 'ACTIVE'}
                          </span>
                        ) : (
                          <span className="text-slate-400">OFF</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Summary Footer */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Active Weekday Dates
                  </span>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5">
                    {calendarDays.filter((d) => d.isAvailableWeekday && !d.isBlocked).length} Days Active
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Blocked Holidays
                  </span>
                  <div className="font-extrabold text-red-600 text-sm mt-0.5">
                    {blockedDates.length} Dates Blocked
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FULL WIDTH BOTTOM SECTION: Scheduled QR Code Service Call Requests */}
          <div className="lg:col-span-12 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-extrabold text-base text-slate-900">
                    Scheduled QR Service Calls ({MONTH_NAMES[selectedMonthIndex]} {selectedYear})
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  View service requests scheduled by customers/holders when scanning their QR code passes.
                </p>
              </div>

              {/* Filter by date dropdown & View Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                {/* View Switcher Toggle */}
                <div className="flex items-center bg-slate-100 p-1 border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setServiceCallViewMode('card')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
                      serviceCallViewMode === 'card'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Card View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceCallViewMode('list')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all ${
                      serviceCallViewMode === 'list'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="List View"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-slate-400" />

                  {/* Filter by Request Type */}
                  <select
                    value={serviceTypeFilter}
                    onChange={(e) => {
                      setServiceTypeFilter(e.target.value as 'all' | 'standard' | 'custom');
                      setScheduleListPage(1);
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Request Types</option>
                    <option value="standard">Standard Services Only</option>
                    <option value="custom">⚡ Custom Work Requests Only</option>
                  </select>

                  {/* Filter by Status */}
                  <select
                    value={serviceStatusFilter}
                    onChange={(e) => {
                      setServiceStatusFilter(e.target.value as 'all' | 'pending' | 'completed');
                      setScheduleListPage(1);
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Call Statuses</option>
                    <option value="pending">Pending / Scheduled Only</option>
                    <option value="completed">Completed Calls Only</option>
                  </select>

                  {/* Filter by Date */}
                  <select
                    value={selectedDateFilter || 'all'}
                    onChange={(e) => {
                      setSelectedDateFilter(e.target.value === 'all' ? null : e.target.value);
                      setScheduleListPage(1);
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Scheduled Dates for {MONTH_NAMES[selectedMonthIndex]}</option>
                    {calendarDays.map((cd) => (
                      <option key={cd.dateStr} value={cd.dateStr}>
                        {cd.dayName}, {cd.dateStr} {bookedCounts[cd.dateStr] ? `(${bookedCounts[cd.dateStr]} Call(s))` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Export CSV Button */}
                  <button
                    type="button"
                    onClick={() => {
                      let reqs: BookedRequestItem[] = [];
                      if (selectedDateFilter) {
                        reqs = bookedRequests[selectedDateFilter] || [];
                      } else {
                        for (const cd of calendarDays) {
                          if (bookedRequests[cd.dateStr]) {
                            reqs.push(...bookedRequests[cd.dateStr]);
                          }
                        }
                      }
                      if (serviceStatusFilter !== 'all') {
                        reqs = reqs.filter((r) => {
                          const st = r.availment.status || 'pending';
                          if (serviceStatusFilter === 'pending') return st !== 'completed';
                          if (serviceStatusFilter === 'completed') return st === 'completed';
                          return true;
                        });
                      }
                      if (serviceTypeFilter !== 'all') {
                        reqs = reqs.filter((r) => {
                          if (serviceTypeFilter === 'custom') return !!r.availment.isCustomRequest;
                          if (serviceTypeFilter === 'standard') return !r.availment.isCustomRequest;
                          return true;
                        });
                      }
                      handleExportScheduleCallsCSV(reqs);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                    title="Export filtered service calls to CSV"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* List of Requests */}
            {(() => {
              // Gather all requests for selected month or selected date filter
              let allRequestsForMonth: BookedRequestItem[] = [];

              if (selectedDateFilter) {
                allRequestsForMonth = bookedRequests[selectedDateFilter] || [];
              } else {
                for (const cd of calendarDays) {
                  if (bookedRequests[cd.dateStr]) {
                    allRequestsForMonth.push(...bookedRequests[cd.dateStr]);
                  }
                }
              }

              // Apply Type Filter
              if (serviceTypeFilter !== 'all') {
                allRequestsForMonth = allRequestsForMonth.filter((req) => {
                  if (serviceTypeFilter === 'custom') return !!req.availment.isCustomRequest;
                  if (serviceTypeFilter === 'standard') return !req.availment.isCustomRequest;
                  return true;
                });
              }

              // Apply Status Filter
              if (serviceStatusFilter !== 'all') {
                allRequestsForMonth = allRequestsForMonth.filter((req) => {
                  const status = req.availment.status || 'pending';
                  if (serviceStatusFilter === 'pending') return status !== 'completed';
                  if (serviceStatusFilter === 'completed') return status === 'completed';
                  return true;
                });
              }

              allRequestsForMonth = allRequestsForMonth.filter(
                (req) => !(req.availment.isCustomRequest && req.availment.approvalStatus === 'rejected')
              );

              if (allRequestsForMonth.length === 0) {
                return (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                    <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
                    <h4 className="font-bold text-slate-700 text-xs">
                      No Scheduled QR Service Calls Found {selectedDateFilter ? `for ${selectedDateFilter}` : `in ${MONTH_NAMES[selectedMonthIndex]}`}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      When end-users scan their assigned QR card and schedule a service call, their appointment details, contact information, and address will appear here.
                    </p>
                  </div>
                );
              }

              const paginatedRequests = allRequestsForMonth.slice(
                (scheduleListPage - 1) * SCHEDULE_PAGE_SIZE,
                scheduleListPage * SCHEDULE_PAGE_SIZE
              );

              return (
                <div className="space-y-4">
                  {serviceCallViewMode === 'list' ? (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                      <table className="w-full text-left text-xs text-slate-600">
                        <thead className="bg-slate-100/90 text-slate-800 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Scheduled Date & Req</th>
                            <th className="px-4 py-3">Contact Person</th>
                            <th className="px-4 py-3">Service Location</th>
                            <th className="px-4 py-3">Requested Services</th>
                            <th className="px-4 py-3">Photos</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium bg-white">
                          {paginatedRequests.map((req, idx) => {
                            const a = req.availment;
                            const addr = a.address;
                            const formattedAddress = addr
                              ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                              : 'N/A';

                            return (
                              <tr key={a.id || idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-black text-slate-900 text-xs flex items-center gap-1">
                                    <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                                    <span>{a.appointmentDate}</span>
                                  </div>
                                  <div className="text-[10px] font-mono text-blue-600 font-extrabold mt-0.5">
                                    REQ #{a.id}
                                  </div>
                                  <div className="text-[10px] text-slate-400">Pass: {req.cardCode}</div>
                                  {a.isCustomRequest && (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-extrabold text-[9px] border border-purple-200">
                                        <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Custom Req
                                      </span>
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-900">{a.contactPersonName || 'N/A'}</div>
                                  <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                                    <Phone className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>{a.contactNumber || 'N/A'}</span>
                                  </div>
                                  {req.assignedUserName && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      Holder: {req.assignedUserName}
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <div className="flex items-start gap-1 text-slate-800 max-w-xs">
                                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                    <span className="font-semibold text-[11px] leading-tight">{formattedAddress}</span>
                                  </div>
                                </td>

                                <td className="px-4 py-3">
                                  {a.isCustomRequest ? (
                                    <div className="space-y-1 max-w-xs">
                                      <div className="text-[11px] font-bold text-purple-900 bg-purple-50 p-2 rounded-lg border border-purple-200">
                                        <span className="block text-[9px] uppercase font-extrabold text-purple-700 mb-0.5">
                                          ⚡ Custom Work Detail:
                                        </span>
                                        {a.customRequestDetails || a.remarks || 'Custom Request'}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span
                                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                                            a.approvalStatus === 'approved'
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                              : a.approvalStatus === 'rejected'
                                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                                              : 'bg-amber-50 text-amber-900 border-amber-300'
                                          }`}
                                        >
                                          {a.approvalStatus === 'approved'
                                            ? '✓ Approved by Jobber'
                                            : a.approvalStatus === 'rejected'
                                            ? '✕ Declined'
                                            : '⏳ Pending Jobber Approval'}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
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
                                  )}
                                  {a.remarks && !a.isCustomRequest && (
                                    <div className="text-[10px] text-slate-500 italic mt-1 max-w-xs truncate" title={a.remarks}>
                                      "{a.remarks}"
                                    </div>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {a.photos && a.photos.length > 0 ? (
                                    <div className="flex items-center gap-1">
                                      {a.photos.map((pUrl, pIdx) => (
                                        <button
                                          key={pIdx}
                                          type="button"
                                          onClick={() => setPreviewImage(pUrl)}
                                          className="w-8 h-8 rounded border border-slate-200 overflow-hidden hover:scale-105 transition-transform"
                                          title="Click to view photo"
                                        >
                                          <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">No photos</span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${
                                      a.status === 'completed'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                        : 'bg-amber-100 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    {a.status || 'Pending'}
                                  </span>
                                </td>

                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDetailedRequest(req)}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1"
                                      title="View full service request details"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-slate-600" /> Details
                                    </button>

                                    {((a.isCustomRequest && a.approvalStatus === 'approved') || !a.isCustomRequest) && a.status !== 'completed' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setScheduleCustomModalItem(req);
                                          setScheduleCustomDate(a.appointmentDate || new Date().toISOString().split('T')[0]);
                                          setScheduleCustomTimeSlot(a.appointmentTimeSlot || '09:00 AM - 10:00 AM');
                                        }}
                                        className={`px-2.5 py-1 text-white text-[11px] font-bold rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs ${
                                          a.isCustomRequest ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                        title="Assign or reschedule appointment date (any date)"
                                      >
                                        <CalendarIcon className="w-3.5 h-3.5" />
                                        {a.appointmentDate ? 'Reschedule' : 'Schedule Date'}
                                      </button>
                                    )}

                                    {a.status === 'completed' ? (
                                      <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed
                                      </span>
                                    ) : a.appointmentDate ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCompletingItem(req);
                                          setCompletionPhotos([]);
                                        }}
                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
                                      >
                                        <Upload className="w-3 h-3" /> Complete
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {paginatedRequests.map((req, idx) => (
                        <div
                          key={req.availment.id || idx}
                          className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-all space-y-3 shadow-2xs"
                        >
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-extrabold uppercase text-blue-600">
                                  REQ #{req.availment.id}
                                </span>
                                {req.availment.isCustomRequest && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 font-extrabold text-[9px] border border-purple-200">
                                    <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Custom
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-black text-slate-900 flex items-center gap-1 mt-0.5">
                                📅 {req.availment.appointmentDate}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                              {req.availment.status || 'Pending'}
                            </span>
                          </div>

                          {/* Custom Request Approval status indicator */}
                          {req.availment.isCustomRequest && (
                            <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200 text-xs space-y-1">
                              <span className="text-[10px] font-extrabold uppercase text-purple-700 block">
                                Custom Request Notes:
                              </span>
                              <div className="font-bold text-purple-950">
                                {req.availment.customRequestDetails || req.availment.remarks || 'Custom Request'}
                              </div>
                              <div className="pt-1 flex items-center justify-between text-[10px]">
                                <span className="text-purple-600 font-medium">Jobber Approval:</span>
                                <span
                                  className={`font-black px-2 py-0.5 rounded-full ${
                                    req.availment.approvalStatus === 'approved'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : req.availment.approvalStatus === 'rejected'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {req.availment.approvalStatus === 'approved'
                                    ? '✓ Approved by Jobber'
                                    : req.availment.approvalStatus === 'rejected'
                                    ? '✕ Declined'
                                    : '⏳ Pending Jobber Approval'}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Contact Info */}
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2 font-extrabold text-slate-900">
                              <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{req.availment.contactPersonName || 'N/A'}</span>
                            </div>

                            <div className="flex items-center gap-2 font-bold text-slate-700">
                              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{req.availment.contactNumber || 'N/A'}</span>
                            </div>

                            {/* Address */}
                            <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                              <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <div>
                                <div className="font-bold text-slate-800">
                                  {req.availment.address.streetAddress}
                                  {req.availment.address.aptSuite ? `, ${req.availment.address.aptSuite}` : ''}
                                </div>
                                <div>
                                  {req.availment.address.city}, {req.availment.address.state} {req.availment.address.zipCode}
                                </div>
                              </div>
                            </div>

                            {/* Requested Services Badges */}
                            <div className="pt-1">
                              <span className="text-[10px] font-bold text-slate-400 block uppercase mb-1">
                                Requested Services:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {req.availment.requestedServices.map((svc, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-bold rounded border border-blue-200"
                                  >
                                    {svc}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Attached Photos */}
                            {req.availment.photos && req.availment.photos.length > 0 && (
                              <div className="pt-2 border-t border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                  <Camera className="w-3 h-3 text-blue-600" />
                                  Attached Photos ({req.availment.photos.length}):
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {req.availment.photos.map((photoUrl, pIdx) => (
                                    <button
                                      type="button"
                                      key={pIdx}
                                      onClick={() => setPreviewImage(photoUrl)}
                                      className="w-14 h-14 rounded-lg overflow-hidden border-2 border-slate-200 hover:border-blue-500 transition-all relative group shrink-0"
                                    >
                                      <img
                                        src={photoUrl}
                                        alt={`Attachment ${pIdx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                                        View
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Remarks / Special Notes */}
                            {req.availment.remarks && (
                              <div className="pt-2 border-t border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                  <FileText className="w-3 h-3 text-slate-600" />
                                  Remarks / Special Requests:
                                </span>
                                <p className="text-xs text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-200 italic font-medium">
                                  "{req.availment.remarks}"
                                </p>
                              </div>
                            )}

                            {/* Admin Completion Proof Photos if completed */}
                            {req.availment.completionPhotos && req.availment.completionPhotos.length > 0 && (
                              <div className="pt-2 border-t border-emerald-200 bg-emerald-50/50 p-2 rounded-lg">
                                <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Admin Completed Proof Photos ({req.availment.completionPhotos.length}):
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {req.availment.completionPhotos.map((cPhoto, cIdx) => (
                                    <button
                                      type="button"
                                      key={cIdx}
                                      onClick={() => setPreviewImage(cPhoto)}
                                      className="w-14 h-14 rounded-lg overflow-hidden border-2 border-emerald-300 hover:border-emerald-600 transition-all relative group shrink-0"
                                    >
                                      <img
                                        src={cPhoto}
                                        alt={`Completion Proof ${cIdx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-emerald-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                                        View
                                      </div>
                                    </button>
                                  ))}
                                </div>
                                {req.availment.completedAt && (
                                  <p className="text-[9px] text-emerald-700 font-semibold mt-1">
                                    Completed on: {new Date(req.availment.completedAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Action Bar to Complete Request or View Details */}
                            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedDetailedRequest(req)}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-slate-200"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-600" /> View Details
                              </button>

                              {((req.availment.isCustomRequest && req.availment.approvalStatus === 'approved') || !req.availment.isCustomRequest) && req.availment.status !== 'completed' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setScheduleCustomModalItem(req);
                                    setScheduleCustomDate(req.availment.appointmentDate || new Date().toISOString().split('T')[0]);
                                    setScheduleCustomTimeSlot(req.availment.appointmentTimeSlot || '09:00 AM - 10:00 AM');
                                  }}
                                  className={`px-3 py-2 text-white font-extrabold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1 ${
                                    req.availment.isCustomRequest ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'
                                  }`}
                                  title="Assign or reschedule appointment date (any date)"
                                >
                                  <CalendarIcon className="w-3.5 h-3.5" />
                                  {req.availment.appointmentDate ? 'Reschedule' : 'Schedule Date'}
                                </button>
                              )}

                              {req.availment.status === 'completed' ? (
                                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Completed
                                </span>
                              ) : req.availment.appointmentDate ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCompletingItem(req);
                                    setCompletionPhotos([]);
                                  }}
                                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Upload className="w-3.5 h-3.5" /> Complete
                                </button>
                              ) : null}
                            </div>

                            {/* Card metadata */}
                            <div className="pt-1 text-[10px] text-slate-500 flex items-center justify-between">
                              <span>Pass Code: <strong className="font-mono text-slate-800">{req.cardCode}</strong></span>
                              {req.assignedUserName && <span>Holder: {req.assignedUserName}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 10 Items Pagination */}
                  <PaginationControls
                    currentPage={scheduleListPage}
                    totalItems={allRequestsForMonth.length}
                    pageSize={SCHEDULE_PAGE_SIZE}
                    onPageChange={setScheduleListPage}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {rejectedCustomRequests.length > 0 && (
        <div className="lg:col-span-12 bg-rose-50/50 p-6 rounded-2xl border border-rose-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-rose-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="font-extrabold text-base text-rose-950">Rejected Custom Requests</h3>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">Kept separate from the service schedule because the Jobber declined these requests.</p>
            </div>
            <span className="text-xs font-black text-rose-800 bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200">
              {rejectedCustomRequests.length} Rejected
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rejectedCustomRequests.map((req) => (
              <button
                key={`${req.cardCode}-${req.availment.id}`}
                type="button"
                onClick={() => setSelectedDetailedRequest(req)}
                className="text-left bg-white border border-rose-200 rounded-xl p-3 hover:border-rose-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-extrabold text-slate-900 truncate">{req.cardTitle}</div>
                    <div className="font-mono text-[10px] text-blue-600">{req.cardCode} • REQ #{req.availment.id}</div>
                  </div>
                  <span className="shrink-0 text-[9px] font-black uppercase text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">Declined</span>
                </div>
                <div className="mt-2 text-xs font-bold text-slate-800">{req.availment.contactPersonName || 'Customer'}</div>
                <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">{req.availment.customRequestDetails || req.availment.remarks || 'No request details provided.'}</div>
                {req.availment.approvalNotes && (
                  <div className="mt-2 text-[10px] text-rose-800 line-clamp-2"><strong>Jobber note:</strong> {req.availment.approvalNotes}</div>
                )}
                <div className="mt-2 text-[10px] font-bold text-rose-700">Click to view details</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ADMIN COMPLETION PHOTO UPLOAD MODAL */}
      {completingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Complete Service Request</h3>
                  <p className="text-xs text-slate-500">
                    Request #{completingItem.availment.id} • Pass Code: {completingItem.cardCode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompletingItem(null);
                  setCompletionPhotos([]);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Summary Box */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-extrabold text-slate-900">
                Customer: {completingItem.availment.contactPersonName || completingItem.assignedUserName} ({completingItem.availment.contactNumber})
              </div>
              <div className="text-slate-600">
                Location: {completingItem.availment.address.streetAddress}, {completingItem.availment.address.city}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {completingItem.availment.requestedServices.map((svc, sIdx) => (
                  <span key={sIdx} className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-bold rounded">
                    {svc}
                  </span>
                ))}
              </div>
            </div>

            {/* MANDATORY COMPLETION PHOTO UPLOAD SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <span>Upload Completed Work Photo(s) *</span>
                </label>
                <span className="text-[10px] font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  REQUIRED BY ADMIN POLICY
                </span>
              </div>

              <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/30 rounded-xl p-5 text-center transition-all">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadCompletionPhoto}
                  className="hidden"
                  id="completion-photo-input"
                />
                <label
                  htmlFor="completion-photo-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                >
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-emerald-800 hover:underline">
                      Click to Browse & Upload Completion Photos
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      JPG, PNG, WEBP images of completed work / service receipt
                    </p>
                  </div>
                </label>
              </div>

              {/* Thumbnails preview */}
              {completionPhotos.length > 0 ? (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Uploaded Completion Photos ({completionPhotos.length}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {completionPhotos.map((photo, pIdx) => (
                      <div key={pIdx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xs group">
                        <img src={photo} alt={`Upload ${pIdx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveCompletionPhoto(pIdx)}
                          className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition-colors"
                          title="Remove photo"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    At least 1 photo showing the completed work is required to finalize this service request.
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setCompletingItem(null);
                  setCompletionPhotos([]);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCompletion}
                disabled={submittingCompletion || completionPhotos.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingCompletion ? (
                  <span>Saving Completion...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Confirm & Mark Request Completed
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE REQUEST DETAIL MODAL */}
      {selectedDetailedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center font-bold">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900">Service Request Details</h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${
                        selectedDetailedRequest.availment.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {selectedDetailedRequest.availment.status || 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    REQ #{selectedDetailedRequest.availment.id} • Pass Code:{' '}
                    <strong className="font-mono text-blue-600">{selectedDetailedRequest.cardCode}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailedRequest(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of Request Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Scheduled Time & Pass Holder */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                  Appointment & Holder
                </span>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {selectedDetailedRequest.availment.appointmentDate
                      ? `Scheduled: ${selectedDetailedRequest.availment.appointmentDate}`
                      : `Target: ${selectedDetailedRequest.availment.targetWeek || 'Date not scheduled'}`}
                  </span>
                </div>
                <div className="text-xs text-slate-600 pt-1 border-t border-slate-200/60">
                  <strong>Card Title:</strong> {selectedDetailedRequest.cardTitle}
                </div>
                {selectedDetailedRequest.assignedUserName && (
                  <div className="text-xs text-slate-600">
                    <strong>Assigned Holder:</strong> {selectedDetailedRequest.assignedUserName} ({selectedDetailedRequest.assignedUserEmail || 'N/A'})
                  </div>
                )}
                <div className="text-[10px] text-slate-400">
                  Booked On: {new Date(selectedDetailedRequest.availment.timestamp).toLocaleString()}
                </div>
              </div>

              {/* Box 2: Customer Contact Person */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">
                  Contact Information
                </span>
                <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <User className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{selectedDetailedRequest.availment.contactPersonName || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <a href={`tel:${selectedDetailedRequest.availment.contactNumber}`} className="hover:underline">
                    {selectedDetailedRequest.availment.contactNumber || 'N/A'}
                  </a>
                </div>
              </div>

              {/* Box 3: Full Address */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" /> Service Location Address
                </span>
                <div className="text-xs font-bold text-slate-900 leading-snug">
                  {selectedDetailedRequest.availment.address.streetAddress}
                  {selectedDetailedRequest.availment.address.aptSuite
                    ? `, ${selectedDetailedRequest.availment.address.aptSuite}`
                    : ''}
                </div>
                <div className="text-xs text-slate-600">
                  {selectedDetailedRequest.availment.address.city},{' '}
                  {selectedDetailedRequest.availment.address.state}{' '}
                  {selectedDetailedRequest.availment.address.zipCode}
                </div>
              </div>

              {/* Box 4: Requested Services or Custom Work */}
              {selectedDetailedRequest.availment.isCustomRequest ? (
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase text-purple-800 tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Custom Work Request
                    </span>
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                        selectedDetailedRequest.availment.approvalStatus === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedDetailedRequest.availment.approvalStatus === 'rejected'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      {selectedDetailedRequest.availment.approvalStatus === 'approved'
                        ? '✓ Approved by Jobber'
                        : selectedDetailedRequest.availment.approvalStatus === 'rejected'
                        ? '✕ Declined by Jobber'
                        : '⏳ Pending Jobber Approval'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-purple-950 bg-white p-3 rounded-lg border border-purple-200">
                    {selectedDetailedRequest.availment.customRequestDetails ||
                      selectedDetailedRequest.availment.remarks ||
                      'Custom Request'}
                  </div>
                  {selectedDetailedRequest.availment.approvalNotes && (
                    <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-lg border border-purple-100">
                      <strong>Jobber Response Note:</strong> {selectedDetailedRequest.availment.approvalNotes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 space-y-2 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-blue-800 block tracking-wider">
                    Requested Services ({selectedDetailedRequest.availment.requestedServices.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDetailedRequest.availment.requestedServices.map((svc, sIdx) => (
                      <span
                        key={sIdx}
                        className="px-2.5 py-1 bg-white text-blue-900 text-xs font-extrabold rounded-lg border border-blue-300 shadow-2xs"
                      >
                        {svc}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Box 5: Special Remarks */}
              {selectedDetailedRequest.availment.remarks && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 block tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-600" /> Customer Remarks / Notes
                  </span>
                  <p className="text-xs text-slate-800 italic bg-white p-2.5 rounded-lg border border-slate-200">
                    "{selectedDetailedRequest.availment.remarks}"
                  </p>
                </div>
              )}

              {/* Box 6: Customer Attached Photos */}
              {selectedDetailedRequest.availment.photos && selectedDetailedRequest.availment.photos.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 md:col-span-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-500 block tracking-wider flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-blue-600" /> Customer Attached Photos (
                    {selectedDetailedRequest.availment.photos.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedDetailedRequest.availment.photos.map((pUrl, pIdx) => (
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

              {/* Box 7: Completion Proof Photos if completed */}
              {selectedDetailedRequest.availment.completionPhotos &&
                selectedDetailedRequest.availment.completionPhotos.length > 0 && (
                  <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 space-y-2 md:col-span-2">
                    <span className="text-[10px] font-extrabold uppercase text-emerald-800 block tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Admin Completion Proof Photos (
                      {selectedDetailedRequest.availment.completionPhotos.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {selectedDetailedRequest.availment.completionPhotos.map((cPhoto, cIdx) => (
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
                    {selectedDetailedRequest.availment.completedAt && (
                      <p className="text-[10px] text-emerald-700 font-bold">
                        Completed on: {new Date(selectedDetailedRequest.availment.completedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-3">
              <div className="flex items-center gap-2">
                {((selectedDetailedRequest.availment.isCustomRequest && selectedDetailedRequest.availment.approvalStatus === 'approved') ||
                  !selectedDetailedRequest.availment.isCustomRequest) &&
                  selectedDetailedRequest.availment.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleCustomModalItem(selectedDetailedRequest);
                        setScheduleCustomDate(
                          selectedDetailedRequest.availment.appointmentDate || new Date().toISOString().split('T')[0]
                        );
                        setScheduleCustomTimeSlot(
                          selectedDetailedRequest.availment.appointmentTimeSlot || '09:00 AM - 10:00 AM'
                        );
                        setSelectedDetailedRequest(null);
                      }}
                      className={`px-4 py-2 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
                        selectedDetailedRequest.availment.isCustomRequest
                          ? 'bg-purple-600 hover:bg-purple-700'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      <CalendarIcon className="w-4 h-4" />
                      {selectedDetailedRequest.availment.appointmentDate ? 'Reschedule' : 'Schedule Date'}
                    </button>
                  )}
                {selectedDetailedRequest.availment.status !== 'completed' && (
                  selectedDetailedRequest.availment.appointmentDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCompletingItem(selectedDetailedRequest);
                      setCompletionPhotos([]);
                      setSelectedDetailedRequest(null);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" /> Mark Completed & Upload Proof Photos
                  </button>
                  ) : null
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedDetailedRequest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE / RESCHEDULE SERVICE APPOINTMENT MODAL (ANY DATE) */}
      {scheduleCustomModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${scheduleCustomModalItem.availment.isCustomRequest ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    {scheduleCustomModalItem.availment.appointmentDate ? 'Reschedule Service Appointment' : 'Schedule Service Appointment Date'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Pass: {scheduleCustomModalItem.cardCode} {scheduleCustomModalItem.availment.isCustomRequest ? '• Custom Request' : '• Standard Service'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScheduleCustomModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Details summary */}
            <div className={`border rounded-xl p-3 space-y-1.5 text-xs ${
              scheduleCustomModalItem.availment.isCustomRequest 
                ? 'bg-purple-50/70 border-purple-200/80 text-purple-950' 
                : 'bg-blue-50/70 border-blue-200/80 text-blue-950'
            }`}>
              <div className="font-bold flex items-center justify-between">
                <span>{scheduleCustomModalItem.availment.contactPersonName || 'Customer'}</span>
                <span className="text-[10px] font-mono bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                  {scheduleCustomModalItem.availment.contactNumber || 'No Phone'}
                </span>
              </div>
              {scheduleCustomModalItem.availment.appointmentDate && (
                <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Currently Scheduled: <strong className="text-slate-900">{scheduleCustomModalItem.availment.appointmentDate}</strong> ({scheduleCustomModalItem.availment.appointmentTimeSlot || 'Standard Slot'})</span>
                </div>
              )}
              {scheduleCustomModalItem.availment.targetWeek && (
                <p className="text-[11px] font-bold text-indigo-700">
                  Customer Preferred Week: {scheduleCustomModalItem.availment.targetWeek}
                </p>
              )}
              <p className="text-[11px] text-slate-600 line-clamp-2">
                {scheduleCustomModalItem.availment.customRequestDetails || scheduleCustomModalItem.availment.remarks || (scheduleCustomModalItem.availment.requestedServices || []).join(', ') || 'Standard Service Call'}
              </p>
            </div>

            {/* Scheduling Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!scheduleCustomDate) {
                  onError('Please choose a valid service appointment date.');
                  return;
                }
                setSchedulingCustomSubmitting(true);
                try {
                  await updateAvailmentScheduleDate(
                    scheduleCustomModalItem.cardCode,
                    scheduleCustomModalItem.availment.id,
                    scheduleCustomDate,
                    scheduleCustomTimeSlot,
                    currentAdminUid
                  );
                  onScheduleAvailment?.(
                    scheduleCustomModalItem.cardCode,
                    scheduleCustomModalItem.availment.id,
                    scheduleCustomDate,
                    scheduleCustomTimeSlot
                  );
                  onSuccess(`Service appointment successfully ${scheduleCustomModalItem.availment.appointmentDate ? 'rescheduled' : 'scheduled'} for ${scheduleCustomDate} (${scheduleCustomTimeSlot}).`);
                  setScheduleCustomModalItem(null);
                } catch (err: any) {
                  onError(err.message || 'Failed to update schedule date.');
                } finally {
                  setSchedulingCustomSubmitting(false);
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
                  value={scheduleCustomDate}
                  onChange={(e) => setScheduleCustomDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[10px] text-slate-500 mt-1 font-medium">
                  Select any calendar date (weekdays, weekends, or future dates).
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  Service Time Window
                </label>
                <select
                  value={scheduleCustomTimeSlot}
                  onChange={(e) => setScheduleCustomTimeSlot(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {timeSlots.map((ts, tIdx) => (
                    <option key={tIdx} value={ts}>{ts}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setScheduleCustomModalItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingCustomSubmitting}
                  className={`px-4 py-2 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 ${
                    scheduleCustomModalItem.availment.isCustomRequest ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {schedulingCustomSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CalendarDays className="w-3.5 h-3.5" />
                      {scheduleCustomModalItem.availment.appointmentDate ? 'Confirm Reschedule' : 'Confirm Schedule'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULLSIZE PHOTO PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <h3 className="font-extrabold text-sm text-slate-900">Attached Issue Photo</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-xl border border-slate-200 flex items-center justify-center bg-black">
              <img
                src={previewImage}
                alt="Full preview"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


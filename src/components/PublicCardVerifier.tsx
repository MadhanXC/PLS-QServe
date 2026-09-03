import React, { useState, useEffect, useRef } from 'react';
import { QrCard, QrCardStatus, UsAddress, ServiceAvailment, AdminSchedule } from '../types';
import {
  getQrCardById,
  updateQrCardStatus,
  submitServiceAvailment,
  getAdminSchedule,
  isQrCardUsed
} from '../lib/userService';
import { QrCodeCanvas } from './QrCodeCanvas';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  UserCheck,
  ArrowLeft,
  QrCode,
  Check,
  Clock,
  Sparkles,
  MapPin,
  Phone,
  User,
  Send,
  Building2,
  Lock,
  Pencil,
  CheckSquare,
  Square,
  History,
  Tag,
  Camera,
  Upload,
  Image as ImageIcon,
  Trash2,
  Eye,
  X,
  FileText,
  Info,
  Mail
} from 'lucide-react';
interface PublicCardVerifierProps {
  cardId: string;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];
const US_STATE_NAME_TO_CODE: Record<string, string> = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
  'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR'
};
const getUsStateCode = (rawState?: string, rawStateCode?: string): string => {
  if (rawStateCode && rawStateCode.length === 2 && US_STATES.includes(rawStateCode.toUpperCase())) {
    return rawStateCode.toUpperCase();
  }
  if (rawState) {
    const clean = rawState.trim().toUpperCase();
    if (clean.length === 2 && US_STATES.includes(clean)) {
      return clean;
    }
    if (US_STATE_NAME_TO_CODE[clean]) {
      return US_STATE_NAME_TO_CODE[clean];
    }
    if (clean.startsWith('US-')) {
      const code = clean.replace('US-', '');
      if (US_STATES.includes(code)) return code;
    }
  }
  return 'CA';
};
interface AddressSuggestion {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  fullDisplay: string;
}
const PRESET_US_ADDRESSES: AddressSuggestion[] = [
  { streetAddress: '100 Wilshire Blvd', city: 'Santa Monica', state: 'CA', zipCode: '90401', fullDisplay: '100 Wilshire Blvd, Santa Monica, CA 90401' },
  { streetAddress: '350 5th Ave', city: 'New York', state: 'NY', zipCode: '10118', fullDisplay: '350 5th Ave, New York, NY 10118' },
  { streetAddress: '1 Apple Park Way', city: 'Cupertino', state: 'CA', zipCode: '95014', fullDisplay: '1 Apple Park Way, Cupertino, CA 95014' },
  { streetAddress: '1600 Amphitheatre Pkwy', city: 'Mountain View', state: 'CA', zipCode: '94043', fullDisplay: '1600 Amphitheatre Pkwy, Mountain View, CA 94043' },
  { streetAddress: '500 Howard St', city: 'San Francisco', state: 'CA', zipCode: '94105', fullDisplay: '500 Howard St, San Francisco, CA 94105' },
  { streetAddress: '200 E Randolph St', city: 'Chicago', state: 'IL', zipCode: '60601', fullDisplay: '200 E Randolph St, Chicago, IL 60601' },
  { streetAddress: '1000 S Pine Island Rd', city: 'Plantation', state: 'FL', zipCode: '33324', fullDisplay: '1000 S Pine Island Rd, Plantation, FL 33324' },
  { streetAddress: '1000 Main St', city: 'Houston', state: 'TX', zipCode: '77002', fullDisplay: '1000 Main St, Houston, TX 77002' },
  { streetAddress: '1 Park Ave', city: 'New York', state: 'NY', zipCode: '10016', fullDisplay: '1 Park Ave, New York, NY 10016' },
  { streetAddress: '1201 3rd Ave', city: 'Seattle', state: 'WA', zipCode: '98101', fullDisplay: '1201 3rd Ave, Seattle, WA 98101' },
];
export const PublicCardVerifier: React.FC<PublicCardVerifierProps> = ({
  cardId,
  onClose,
  onSuccessToast
}) => {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<QrCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  // Form State for Availing Services
  const [requestMode, setRequestMode] = useState<'standard' | 'custom'>('standard');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customRequestText, setCustomRequestText] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [remarks, setRemarks] = useState('');
  // Photos Attachment State
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Schedule & Appointment Selection State
  const [adminSchedule, setAdminSchedule] = useState<AdminSchedule | null>(null);
  const [availableDates, setAvailableDates] = useState<Array<{ dateStr: string; label: string }>>([]);
  const [appointmentDate, setAppointmentDate] = useState<string>('');
  // Custom Request Preferred Week State
  const upcomingWeeks = React.useMemo(() => {
    const weeks: Array<{ id: string; label: string; dateRange: string }> = [];
    const now = new Date();
    const day = now.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() + diffToMonday);
    currentMonday.setHours(0, 0, 0, 0);
    let startOffset = 0;
    if (day === 5 && now.getHours() >= 16) {
      startOffset = 1;
    } else if (day === 6 || day === 0) {
      startOffset = 1;
    }
    for (let i = startOffset; i < startOffset + 8; i++) {
      const monday = new Date(currentMonday);
      monday.setDate(currentMonday.getDate() + i * 7);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      const monMonth = monday.toLocaleDateString('en-US', { month: 'short' });
      const monDay = monday.getDate();
      const monYear = monday.getFullYear();
      const friMonth = friday.toLocaleDateString('en-US', { month: 'short' });
      const friDay = friday.getDate();
      const friYear = friday.getFullYear();
      const rangeStr = monMonth === friMonth
        ? `${monMonth} ${monDay} – ${friDay}, ${monYear}`
        : `${monMonth} ${monDay} – ${friMonth} ${friDay}, ${friYear}`;
      const labelPrefix = i === 0 ? 'This Week' : i === 1 ? 'Next Week' : `Week of ${monMonth} ${monDay}`;
      const fullWeekId = `Week of ${rangeStr}`;
      weeks.push({
        id: fullWeekId,
        label: `${labelPrefix} (${rangeStr})`,
        dateRange: rangeStr
      });
    }
    return weeks;
  }, []);
  const [targetWeek, setTargetWeek] = useState<string>('');
  useEffect(() => {
    if (upcomingWeeks.length > 0 && !targetWeek) {
      setTargetWeek(upcomingWeeks[0].id);
    }
  }, [upcomingWeeks, targetWeek]);
  // US Address Pack State
  const [streetAddress, setStreetAddress] = useState('');
  const [aptSuite, setAptSuite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('CA');
  const [zipCode, setZipCode] = useState('');
  // Autocomplete Dropdown State
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>(PRESET_US_ADDRESSES);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [allowEditAddress, setAllowEditAddress] = useState(false);
  const [submittingAvailment, setSubmittingAvailment] = useState(false);
  const [availmentSuccessMsg, setAvailmentSuccessMsg] = useState<string | null>(null);
  const [lastSubmittedRequest, setLastSubmittedRequest] = useState<ServiceAvailment | null>(null);
  const [showCloseTabMessage, setShowCloseTabMessage] = useState(false);
  // Set of services already availed in previous requests on this card
  const alreadyAvailedServices = React.useMemo(() => {
    const set = new Set<string>();
    if (card?.availments) {
      for (const a of card.availments) {
        if (a.requestedServices && Array.isArray(a.requestedServices)) {
          for (const s of a.requestedServices) {
            if (s) set.add(s.trim());
          }
        }
      }
    }
    return set;
  }, [card]);
  // List of remaining services available for selection
  const availableServices = React.useMemo(() => {
    if (!card?.services) return [];
    return card.services.filter((svc) => !alreadyAvailedServices.has(svc.trim()));
  }, [card, alreadyAvailedServices]);
  const handleSelectAddressSuggestion = (suggestion: AddressSuggestion) => {
    setStreetAddress(suggestion.streetAddress);
    setCity(suggestion.city);
    setState(suggestion.state);
    setZipCode(suggestion.zipCode);
    setShowAddressDropdown(false);
  };
  const handleStreetAddressInputChange = async (val: string) => {
    setStreetAddress(val);
    if (!val.trim()) {
      setAddressSuggestions(PRESET_US_ADDRESSES);
      setShowAddressDropdown(false);
      return;
    }
    setShowAddressDropdown(true);
    const filtered = PRESET_US_ADDRESSES.filter((a) =>
      a.fullDisplay.toLowerCase().includes(val.toLowerCase()) ||
      a.streetAddress.toLowerCase().includes(val.toLowerCase()) ||
      a.city.toLowerCase().includes(val.toLowerCase())
    );
    setAddressSuggestions(filtered.length > 0 ? filtered : PRESET_US_ADDRESSES);
    if (val.trim().length >= 3) {
      setSearchingAddress(true);
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&addressdetails=1&q=${encodeURIComponent(val)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            const apiResults: AddressSuggestion[] = data.slice(0, 5).map((item: any) => {
              const addr = item.address || {};
              const houseNum = addr.house_number || '';
              const road = addr.road || addr.pedestrian || addr.street || item.display_name.split(',')[0];
              const stAddr = houseNum ? `${houseNum} ${road}` : road;
              const cityVal = addr.city || addr.town || addr.village || addr.county || '';
              const stateVal = getUsStateCode(addr.state, addr.state_code);
              const zipVal = addr.postcode || '';
              return {
                streetAddress: stAddr,
                city: cityVal,
                state: stateVal,
                zipCode: zipVal,
                fullDisplay: `${stAddr}${cityVal ? ', ' + cityVal : ''}${stateVal ? ', ' + stateVal : ''}${zipVal ? ' ' + zipVal : ''}`
              };
            });
            const combined = [...apiResults, ...filtered];
            const unique = combined.filter((v, i, a) => a.findIndex((t) => t.fullDisplay === v.fullDisplay) === i);
            setAddressSuggestions(unique);
          }
        }
      } catch (e) {
        console.warn('Address autocomplete fetch warning:', e);
      } finally {
        setSearchingAddress(false);
      }
    }
  };
  useEffect(() => {
    async function fetchCard() {
      setLoading(true);
      setError(null);
      try {
        const foundCard = await getQrCardById(cardId);
        if (foundCard) {
          setCard(foundCard);
          // Initialize Form Fields (Unticked initially as requested)
          setSelectedServices([]);
          setPhotos([]);
          // Customer contact info logic:
          // Blank on the first time (no saved customer info and no previous availment).
          // From the next time, automatically populate with the previously added customer name, email, and phone (like savedAddress).
          const latestAvailment = foundCard.availments && foundCard.availments.length > 0 ? foundCard.availments[0] : null;
          const savedCustName = foundCard.savedContactName || latestAvailment?.contactPersonName || '';
          const savedCustEmail = foundCard.savedContactEmail || latestAvailment?.contactEmail || '';
          const savedCustPhone = foundCard.savedContactPhone || latestAvailment?.contactNumber || '';
          setContactPersonName(savedCustName);
          setContactEmail(savedCustEmail);
          setContactNumber(savedCustPhone);
          if (foundCard.savedAddress) {
            setStreetAddress(foundCard.savedAddress.streetAddress || '');
            setAptSuite(foundCard.savedAddress.aptSuite || '');
            setCity(foundCard.savedAddress.city || '');
            setState(foundCard.savedAddress.state || 'CA');
            setZipCode(foundCard.savedAddress.zipCode || '');
            setAllowEditAddress(false);
          } else {
            setAllowEditAddress(true);
          }
          // Fetch Admin's Weekday Schedule for Current Month (1 single document read, cached)
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonthIndex = now.getMonth();
          const currentMonthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
          let fallbackSched: AdminSchedule | null = null;
          try {
            if (foundCard.adminUid) {
              fallbackSched = await getAdminSchedule(foundCard.adminUid, currentMonthKey);
            }
          } catch (e) {
            console.warn('Schedule fetch error:', e);
          }
          setAdminSchedule(fallbackSched);
          const enabledWeekdays = fallbackSched?.enabledWeekdays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
          const blockedDatesSet = new Set(fallbackSched?.blockedDates || []);
          // Calculate valid weekday dates for the next 4 weeks (28 days)
          const validDates: Array<{ dateStr: string; label: string }> = [];
          const fourWeeksFromNow = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
          for (let d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d <= fourWeeksFromNow; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dayNum = String(d.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${dayNum}`;
            const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
            const isBlocked = blockedDatesSet.has(dateStr);
            if (enabledWeekdays.includes(dayName) && !isBlocked) {
              const formattedLabel = `${dayName}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${dateStr})`;
              validDates.push({ dateStr, label: formattedLabel });
            }
          }
          setAvailableDates(validDates);
          if (validDates.length > 0) {
            setAppointmentDate(validDates[0].dateStr);
          }
        } else {
          setError(`No valid service card found for ID or Code: "${cardId}"`);
        }
      } catch (err) {
        console.error('Error verifying card:', err);
        setError('Failed to query card verification database.');
      } finally {
        setLoading(false);
      }
    }
    if (cardId) {
      fetchCard();
    }
  }, [cardId]);
  const handleStatusChange = async (newStatus: QrCardStatus) => {
    if (!card) return;
    setUpdating(true);
    try {
      await updateQrCardStatus(card.id, newStatus);
      setCard({ ...card, status: newStatus });
      if (onSuccessToast) {
        onSuccessToast(`Card status updated to ${newStatus.toUpperCase()}`);
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdating(false);
    }
  };
  const toggleService = (svc: string) => {
    if (alreadyAvailedServices.has(svc.trim())) {
      alert(`The service "${svc}" has already been availed and cannot be requested again.`);
      return;
    }
    if (selectedServices.includes(svc)) {
      setSelectedServices(selectedServices.filter((s) => s !== svc));
    } else {
      if (selectedServices.length >= 2) {
        alert('You can select a maximum of 2 services per request.');
        return;
      }
      setSelectedServices([...selectedServices, svc]);
    }
  };
  const handleToggleSelectAllServices = () => {
    if (!card || !card.services) return;
    if (selectedServices.length > 0) {
      setSelectedServices([]);
    } else {
      // Select up to 2 unavailed services max
      setSelectedServices(availableServices.slice(0, 2));
    }
  };
  // Helper to compress and convert photo files to base64 data URLs
  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1024;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(dataUrl);
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };
  const handlePhotoFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotos(true);
    try {
      const newPhotoPromises = Array.from(files).map((file) => processImageFile(file));
      const newPhotoDataUrls = await Promise.all(newPhotoPromises);
      setPhotos((prev) => [...prev, ...newPhotoDataUrls]);
    } catch (err) {
      console.error('Error processing photo files:', err);
      alert('Failed to process one or more photo files.');
    } finally {
      setUploadingPhotos(false);
    }
  };
  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };
  const handleSubmitAvailmentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!card) return;
    if (requestMode === 'custom') {
      if (!customRequestText.trim()) {
        alert('Please provide details for your custom service request.');
        return;
      }
    } else {
      if (selectedServices.length === 0) {
        alert('Please select at least 1 service to avail.');
        return;
      }
      if (selectedServices.length > 2) {
        alert('You can select a maximum of 2 services at a time.');
        return;
      }
      const invalidSelected = selectedServices.filter((s) => alreadyAvailedServices.has(s.trim()));
      if (invalidSelected.length > 0) {
        alert(`The service(s) "${invalidSelected.join(', ')}" have already been availed and cannot be requested again.`);
        return;
      }
    }
    if (photos.length === 0) {
      alert('Photo attachment is MANDATORY. Please take or upload at least 1 photo of the service area or issue.');
      return;
    }
    if (!contactPersonName.trim()) {
      alert('Please enter the contact person name.');
      return;
    }
    if (!contactNumber.trim()) {
      alert('Please enter a contact phone number.');
      return;
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      alert('Please enter a valid contact email address to receive your service confirmation and schedule updates.');
      return;
    }
    // Validate US Address pack
    if (!streetAddress.trim() || !city.trim() || !state.trim() || !zipCode.trim()) {
      alert('Please fill out the complete US address (Street, City, State, ZIP).');
      return;
    }
    setSubmittingAvailment(true);
    setAvailmentSuccessMsg(null);
    const addressObj: UsAddress = {
      streetAddress: streetAddress.trim(),
      aptSuite: aptSuite.trim() || '',
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim()
    };
    try {
      const isCustom = requestMode === 'custom';
      const updatedCard = await submitServiceAvailment(card.id, {
        requestedServices: isCustom
          ? [`Custom: ${customRequestText.trim().slice(0, 45)}${customRequestText.trim().length > 45 ? '...' : ''}`]
          : selectedServices,
        isCustomRequest: isCustom,
        customRequestDetails: isCustom ? customRequestText.trim() : undefined,
        targetWeek: targetWeek || upcomingWeeks[0]?.id,
        contactPersonName: contactPersonName.trim(),
        contactNumber: contactNumber.trim(),
        contactEmail: contactEmail.trim(),
        address: addressObj,
        photos: photos,
        remarks: remarks.trim()
      });
      setCard(updatedCard);
      const newestRequest = updatedCard.availments && updatedCard.availments[0];
      setLastSubmittedRequest(newestRequest || null);
      setAvailmentSuccessMsg(
        isCustom
          ? 'Custom service request submitted successfully! An email has been sent to the jobber for review, and admin has been notified.'
          : 'Service request submitted successfully! The administrator will review the calendar and schedule your confirmed appointment date.'
      );
      
      // Fix address so it displays as saved for future visits
      setAllowEditAddress(false);
      setPhotos([]);
      setSelectedServices([]);
      setCustomRequestText('');
      setRemarks('');
      if (onSuccessToast) {
        onSuccessToast(
          isCustom
            ? 'Custom request submitted and sent for review!'
            : 'Service request submitted! Admin will schedule the appointment date.'
        );
      }
    } catch (err: any) {
      console.error('Error submitting service request:', err);
      alert(err.message || 'Failed to submit service request.');
    } finally {
      setSubmittingAvailment(false);
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 text-white rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <QrCode className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold">Verifying Service Pass...</h2>
          <p className="text-xs text-slate-400">Fetching scan verification & service options from cloud database.</p>
        </div>
      </div>
    );
  }
  if (error || !card) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-red-500/30 text-white rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-red-300">Invalid or Unrecognized Pass</h2>
          <p className="text-xs text-slate-300">{error || 'This QR Code link does not match any card in the registry.'}</p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Go to Portal Home
          </button>
        </div>
      </div>
    );
  }
  const isExpired = new Date(card.validUntil) < new Date();
  const isUsed = isQrCardUsed(card);
  const isValid =
    card.status !== 'revoked' &&
    card.status !== 'expired' &&
    !isExpired;
  const hasSavedAddress = !!card.savedAddress;
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-6 py-8">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-4">
        {/* Verification Status Header */}
        <div
          className={`p-6 text-white text-center relative ${
            isValid
              ? 'bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-900'
              : isUsed
              ? 'bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900'
              : 'bg-gradient-to-r from-red-900 via-rose-900 to-slate-900'
          }`}
        >
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 backdrop-blur-md mb-2">
            {isValid ? (
              <ShieldCheck className="w-7 h-7 text-emerald-200" />
            ) : (
              <XCircle className="w-7 h-7 text-red-200" />
            )}
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/80 block">
            VERIFIED SERVICE PASS & AVAILMENT PORTAL
          </span>
          <h1 className="text-xl font-extrabold tracking-tight mt-0.5">
            {card.cardTitle}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-200 bg-white/10 px-2.5 py-1 rounded border border-white/20">
              {card.cardCode}
            </span>
            <span className="text-xs font-bold text-white/90 bg-white/10 px-2.5 py-1 rounded border border-white/20 uppercase">
              STATUS: {card.status === 'active' ? `Active / ${isUsed ? 'Used' : 'Unused'}` : card.status}
            </span>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {/* SUCCESS TICKET SCREEN (Shows ONLY this once request is submitted) */}
          {lastSubmittedRequest ? (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-6 text-emerald-900 space-y-5 shadow-lg text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-800 bg-emerald-200/80 px-3 py-1 rounded-full border border-emerald-300">
                  REQUEST CONFIRMED
                </span>
                <h2 className="text-2xl font-black text-emerald-950 mt-2">
                  Service Request Successfully Placed!
                </h2>
                <p className="text-xs text-emerald-700 mt-1">
                  Ticket Reference ID: <span className="font-mono font-bold text-emerald-950 bg-emerald-200/60 px-2 py-0.5 rounded">{lastSubmittedRequest.id}</span>
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-emerald-200 text-xs space-y-2.5 text-left shadow-2xs">
                <div className="flex items-start justify-between">
                  <span className="font-bold text-slate-500">Requested Services:</span>
                  <span className="font-extrabold text-emerald-800 text-right">
                    {lastSubmittedRequest.requestedServices.join(', ')}
                  </span>
                </div>
                {lastSubmittedRequest.appointmentDate ? (
                  <div className="flex items-start justify-between border-t border-slate-100 pt-2">
                    <span className="font-bold text-slate-500">Scheduled Date:</span>
                    <span className="font-extrabold text-blue-900 text-right">
                      📅 {lastSubmittedRequest.appointmentDate}
                    </span>
                  </div>
                ) : lastSubmittedRequest.targetWeek ? (
                  <div className="flex items-start justify-between border-t border-slate-100 pt-2">
                    <span className="font-bold text-slate-500">Requested Week:</span>
                    <span className="font-extrabold text-purple-900 text-right">
                      🗓️ {lastSubmittedRequest.targetWeek}
                      <span className="block text-[10px] text-purple-600 font-normal">
                        (Exact date will be scheduled by admin upon jobber approval)
                      </span>
                    </span>
                  </div>
                ) : null}
                <div className="flex items-start justify-between border-t border-slate-100 pt-2">
                  <span className="font-bold text-slate-500">Contact Person:</span>
                  <span className="font-semibold text-slate-900">
                    {lastSubmittedRequest.contactPersonName} ({lastSubmittedRequest.contactNumber})
                  </span>
                </div>
                <div className="flex items-start justify-between border-t border-slate-100 pt-2">
                  <span className="font-bold text-slate-500">Service Address:</span>
                  <span className="font-medium text-slate-800 text-right">
                    {lastSubmittedRequest.address.streetAddress}
                    {lastSubmittedRequest.address.aptSuite ? `, ${lastSubmittedRequest.address.aptSuite}` : ''},{' '}
                    {lastSubmittedRequest.address.city}, {lastSubmittedRequest.address.state} {lastSubmittedRequest.address.zipCode}
                  </span>
                </div>
                {lastSubmittedRequest.remarks && (
                  <div className="flex items-start justify-between border-t border-slate-100 pt-2">
                    <span className="font-bold text-slate-500">Remarks / Requests:</span>
                    <span className="font-medium text-slate-800 text-right italic">
                      "{lastSubmittedRequest.remarks}"
                    </span>
                  </div>
                )}
                {lastSubmittedRequest.photos && lastSubmittedRequest.photos.length > 0 && (
                  <div className="border-t border-slate-100 pt-2">
                    <span className="font-bold text-slate-500 block mb-1">Attached Photos ({lastSubmittedRequest.photos.length}):</span>
                    <div className="flex flex-wrap gap-2">
                      {lastSubmittedRequest.photos.map((pUrl, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setPreviewImage(pUrl)}
                          className="w-12 h-12 rounded-lg overflow-hidden border border-emerald-300 relative group shrink-0"
                        >
                          <img src={pUrl} alt={`Attached ${pIdx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setLastSubmittedRequest(null);
                    setShowCloseTabMessage(false);
                  }}
                  className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs rounded-xl transition-colors border border-emerald-300"
                >
                  Submit Another Request
                </button>
                {!showCloseTabMessage ? (
                  <button
                    type="button"
                    onClick={() => setShowCloseTabMessage(true)}
                    className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl transition-colors shadow-2xs"
                  >
                    Done
                  </button>
                ) : (
                  <div className="px-4 py-2 bg-emerald-100 text-emerald-900 font-bold text-xs rounded-xl border border-emerald-300">
                    You can close this tab now.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Contact Person & Expiry Meta info */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Contact Person / Holder
                  </span>
                  <span className="font-extrabold text-slate-900 text-sm block mt-0.5">
                    {card.savedContactName || (card.availments && card.availments[0]?.contactPersonName) || 'Customer / Card Holder'}
                  </span>
                  {(card.savedContactEmail || (card.availments && card.availments[0]?.contactEmail)) ? (
                    <span className="text-[11px] text-slate-500 truncate block">
                      {card.savedContactEmail || card.availments?.[0]?.contactEmail}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic block mt-0.5">Contact info saved on 1st request</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Pass Valid Until
                  </span>
                  <span className="font-extrabold text-slate-900 text-sm block mt-0.5">
                    {card.validUntil}
                  </span>
                  {card.firstAvailedDate && (
                    <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                      🗓️ 1 Year from 1st Service ({card.firstAvailedDate})
                    </span>
                  )}
                </div>
              </div>
              {/* MAIN FORM: SERVICE AVAILMENT */}
              {isValid ? (
              <form onSubmit={handleSubmitAvailmentForm} className="space-y-5">
                <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <h3 className="font-extrabold text-sm text-slate-900">Avail Facility Services</h3>
                  </div>
                  {requestMode === 'standard' && availableServices.length > 0 && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAllServices}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      {selectedServices.length > 0 ? 'Deselect All' : 'Select Top 2'}
                    </button>
                  )}
                </div>
                {/* MODE SELECTION TABS: STANDARD VS CUSTOM REQUEST */}
                {card.allowCustomRequest !== false && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setRequestMode('standard')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        requestMode === 'standard'
                          ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Included Services ({availableServices.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestMode('custom')}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        requestMode === 'custom'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Custom Request
                    </button>
                  </div>
                )}
                {/* 1A. STANDARD INCLUDED SERVICES (MAX 2 AT A TIME) */}
                {requestMode === 'standard' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-700">
                        Which services do you want to avail today? (Max 2 *)
                      </label>
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded ${
                        selectedServices.length === 2
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : selectedServices.length === 1
                          ? 'bg-blue-100 text-blue-900 border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {selectedServices.length}/2 Selected
                      </span>
                    </div>
                    {availableServices.length === 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>All preset services on this pass have already been availed. You can still submit a custom request above.</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {card.services.map((svc, idx) => {
                        const isAvailed = alreadyAvailedServices.has(svc.trim());
                        const isChecked = selectedServices.includes(svc);
                        return (
                          <button
                            type="button"
                            key={idx}
                            disabled={isAvailed}
                            onClick={() => toggleService(svc)}
                            className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                              isAvailed
                                ? 'bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed opacity-75'
                                : isChecked
                                ? 'bg-blue-50 text-blue-900 border-blue-400 ring-2 ring-blue-500/20 shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {isAvailed ? (
                                <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
                              ) : isChecked ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span className={isAvailed ? 'line-through decoration-slate-300' : ''}>{svc}</span>
                            </span>
                            {isAvailed ? (
                              <span className="text-[10px] font-extrabold uppercase bg-slate-200/80 text-slate-500 px-2 py-0.5 rounded">
                                Availed
                              </span>
                            ) : isChecked ? (
                              <Check className="w-3.5 h-3.5 text-blue-600" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* 1B. CUSTOM SERVICE REQUEST OPTION */
                  <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        Custom Service / Facility Request *
                      </label>
                      <span className="text-[10px] bg-purple-200/80 text-purple-900 font-extrabold px-2 py-0.5 rounded uppercase">
                        Jobber Approval Required
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-800">
                      Need service work other than the listed preset options? Enter your requirement below. A notification and email will be dispatched to our facility service team and administrator. The team will review and approve or decline your custom request.
                    </p>
                    {card.customRequestInstructions && (
                      <div className="p-2.5 bg-white/90 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-0.5">
                        <span className="font-extrabold text-[10px] uppercase text-purple-700 block">
                          Card Policy / Instructions:
                        </span>
                        <p className="text-[11px] text-purple-950">{card.customRequestInstructions}</p>
                      </div>
                    )}
                    <textarea
                      rows={3}
                      value={customRequestText}
                      onChange={(e) => setCustomRequestText(e.target.value)}
                      placeholder="Describe the specific custom service, repair, or maintenance you require in detail..."
                      required={requestMode === 'custom'}
                      className="w-full px-3.5 py-2.5 bg-white border border-purple-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
                  </div>
                )}
            {/* Hidden File Inputs for Camera and Gallery Upload */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handlePhotoFilesSelected(e.target.files)}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handlePhotoFilesSelected(e.target.files)}
            />
            {/* 2. PHOTO ATTACHMENT (MANDATORY FIELD) */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-blue-600" />
                  Attach Service Area / Issue Pictures *
                </label>
                <span className="text-[10px] bg-red-100 text-red-800 font-extrabold px-2 py-0.5 rounded uppercase border border-red-200">
                  MANDATORY
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Please take or upload at least 1 photo showing the equipment/facility area or service issue.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" /> Take Picture
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-300 shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4 text-blue-600" /> Upload Photo
                </button>
              </div>
              {uploadingPhotos && (
                <div className="text-xs text-blue-600 font-bold flex items-center gap-2">
                  <span className="animate-spin">⌛</span> Processing photo file(s)...
                </div>
              )}
              {/* Photos Preview Grid */}
              {photos.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1">
                  {photos.map((photoUrl, pIdx) => (
                    <div
                      key={pIdx}
                      className="w-full aspect-square rounded-xl overflow-hidden border-2 border-slate-200 relative group bg-black"
                    >
                      <img
                        src={photoUrl}
                        alt={`Photo ${pIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(pIdx)}
                        className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md transition-colors"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border border-dashed border-red-300 bg-red-50/50 rounded-xl text-center text-xs text-red-700 font-medium">
                  ⚠️ No pictures attached yet. At least 1 photo is required to submit this request.
                </div>
              )}
            </div>
            {/* 2. SELECT PREFERRED TARGET WEEK (FOR BOTH STANDARD & CUSTOM) */}
            {requestMode === 'custom' ? (
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-purple-700" />
                    Select Preferred Target Week *
                  </label>
                  <span className="text-[10px] bg-purple-200/90 text-purple-900 font-extrabold px-2 py-0.5 rounded">
                    MON – FRI WEEK
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-purple-900">
                    Preferred Week for Custom Work *
                  </label>
                  <select
                    value={targetWeek}
                    onChange={(e) => setTargetWeek(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600 shadow-2xs"
                  >
                    {upcomingWeeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        🗓️ {w.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-white/90 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 leading-relaxed text-[11px]">
                    <span className="font-bold block text-purple-950">How Custom Scheduling Works:</span>
                    <span>
                      1. You submit your custom request with your preferred week.
                      <br />
                      2. The facility service team reviews and approves the request.
                      <br />
                      3. Once approved, the administrator checks the calendar, assigns the exact date, and notifies you by email.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-blue-950 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-700" />
                    Select Preferred Service Week *
                  </label>
                  <span className="text-[10px] bg-blue-200/90 text-blue-900 font-extrabold px-2 py-0.5 rounded">
                    DIRECT ADMIN SCHEDULING
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-blue-900">
                    Preferred Week for Service *
                  </label>
                  <select
                    value={targetWeek}
                    onChange={(e) => setTargetWeek(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
                  >
                    {upcomingWeeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        🗓️ {w.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-3 bg-white/90 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 leading-relaxed text-[11px]">
                    <span className="font-bold block text-blue-950">How Standard Service Scheduling Works:</span>
                    <span>
                      You select your preferred week. No jobber authorization is required. The administrator checks the service calendar, schedules your confirmed service date, and dispatches the confirmation directly to your email.
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* 3. CONTACT PERSON, PHONE NUMBER & EMAIL ID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Contact Person Name *
                </label>
                <input
                  type="text"
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="e.g. John Doe / Facility Manager"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-indigo-600" />
                  Contact Number *
                </label>
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="e.g. (555) 234-5678"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-emerald-600" />
                  Email ID *
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="e.g. contact@domain.com"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
            {/* 3. US ADDRESS PACK (Address added only on 1st time availment) */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Service Facility Address (US Address) *
                </label>
                {hasSavedAddress && (
                  <button
                    type="button"
                    onClick={() => setAllowEditAddress(!allowEditAddress)}
                    className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    {allowEditAddress ? 'Lock Saved Address' : 'Edit Address'}
                  </button>
                )}
              </div>
              {/* Saved Address Banner */}
              {hasSavedAddress && !allowEditAddress ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] uppercase text-emerald-800 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" /> Saved Address (Registered on 1st Availment)
                    </span>
                    <span className="text-[10px] bg-emerald-200/60 text-emerald-900 font-bold px-2 py-0.5 rounded">
                      AUTO-SAVED
                    </span>
                  </div>
                  <div className="font-bold text-sm text-slate-900 pt-0.5">
                    {streetAddress} {aptSuite ? `, ${aptSuite}` : ''}
                  </div>
                  <div className="text-slate-700 font-medium">
                    {city}, {state} {zipCode} (United States)
                  </div>
                  <p className="text-[10px] text-emerald-700 pt-1 italic">
                    Your service address was captured during initial availment and does not need to be re-entered.
                  </p>
                </div>
              ) : (
                /* Editable US Address Form Pack */
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  {!hasSavedAddress && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-blue-900 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>
                        <strong>First Time Availment:</strong> Enter your US address below. It will be saved automatically for future requests.
                      </span>
                    </div>
                  )}
                  {/* STREET ADDRESS WITH LIVE AUTOCOMPLETE DROPDOWN */}
                  <div className="space-y-1 relative">
                    <label className="block text-[11px] font-bold text-slate-700 flex items-center justify-between">
                      <span>Street Address *</span>
                      {searchingAddress && (
                        <span className="text-[10px] text-blue-600 font-normal animate-pulse">Searching US locations...</span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={streetAddress}
                        onChange={(e) => handleStreetAddressInputChange(e.target.value)}
                        onFocus={() => setShowAddressDropdown(true)}
                        placeholder="e.g. 100 Wilshire Blvd (type to see US address dropdown)"
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 pr-8"
                      />
                      <MapPin className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                    {/* FLOATING ADDRESS AUTOCOMPLETE DROPDOWN */}
                    {showAddressDropdown && addressSuggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          <span>US Address Suggestions</span>
                          <button
                            type="button"
                            onClick={() => setShowAddressDropdown(false)}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            ✕
                          </button>
                        </div>
                        {addressSuggestions.map((sug, i) => (
                          <button
                            type="button"
                            key={i}
                            onClick={() => handleSelectAddressSuggestion(sug)}
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-start gap-2.5 text-xs group"
                          >
                            <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                            <div>
                              <div className="font-bold text-slate-900">{sug.streetAddress}</div>
                              <div className="text-[11px] text-slate-500">
                                {sug.city}, {sug.state} {sug.zipCode} (United States)
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1 sm:col-span-1">
                      <label className="block text-[11px] font-bold text-slate-700">Suite / Apt / Unit</label>
                      <input
                        type="text"
                        value={aptSuite}
                        onChange={(e) => setAptSuite(e.target.value)}
                        placeholder="e.g. Suite 200"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Los Angeles"
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">State (US) *</label>
                      <select
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {US_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">ZIP Code *</label>
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        placeholder="e.g. 90210"
                        required
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* 4. OTHER REQUESTS OR REMARKS (OPTIONAL) */}
            <div className="space-y-1.5 pt-3 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Other Requests or Remarks <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter any special instructions, remarks, or specific requests here..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />
            </div>
            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={submittingAvailment}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submittingAvailment ? (
                <span>Submitting Service Request...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Submit Service Availment Request
                </>
              )}
            </button>
              </form>
              ) : (card.status === 'revoked' || card.status === 'expired' || isExpired) ? (
                <div className="p-5 bg-red-50 border-2 border-red-200 rounded-2xl text-red-900 space-y-2 text-center">
                  <XCircle className="w-8 h-8 text-red-600 mx-auto" />
                  <h3 className="font-extrabold text-sm">Service Requests Unavailable</h3>
                  <p className="text-xs leading-relaxed">
                    This service pass is {card.status === 'revoked' ? 'revoked' : 'expired'}, so no services can be requested from it.
                    Please contact your Jobber or administrator for assistance.
                  </p>
                </div>
              ) : null}
          {/* SERVICE REQUEST HISTORY LOG (IF ANY) */}
          {card.availments && card.availments.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-blue-600" /> Past Service Availments ({card.availments.length})
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {card.availments.map((req) => (
                  <div key={req.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-slate-900">
                      <span className="font-mono text-[11px] text-blue-600">{req.id}</span>
                      <span className="text-[10px] text-slate-400">{new Date(req.timestamp).toLocaleString()}</span>
                    </div>
                    {req.isCustomRequest ? (
                      <div className="p-2 bg-purple-50 rounded-lg border border-purple-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[11px] text-purple-900 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Custom Service Request
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                              req.approvalStatus === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : req.approvalStatus === 'rejected'
                                ? 'bg-red-100 text-red-800 border-red-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {req.approvalStatus === 'approved'
                              ? '✓ Approved by Jobber'
                              : req.approvalStatus === 'rejected'
                              ? '✕ Declined by Jobber'
                              : '⏳ Pending Approval'}
                          </span>
                        </div>
                        {req.customRequestDetails && (
                          <div className="text-[11px] text-purple-950 font-medium">
                            {req.customRequestDetails}
                          </div>
                        )}
                        {req.approvalNotes && (
                          <div className="text-[10px] text-purple-800 italic bg-white/70 p-1.5 rounded border border-purple-100">
                            Jobber Note: "{req.approvalNotes}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="font-semibold text-slate-800">
                        Services: <span className="text-blue-700 font-bold">{req.requestedServices.join(', ')}</span>
                      </div>
                    )}
                    {req.appointmentDate ? (
                      <div className="text-blue-900 font-bold text-[11px] flex items-center gap-1">
                        <span>📅 Scheduled Appt:</span> {req.appointmentDate}
                      </div>
                    ) : req.targetWeek ? (
                      <div className="text-purple-900 font-bold text-[11px] flex items-center gap-1">
                        <span>🗓️ Target Week:</span> {req.targetWeek}
                        {req.approvalStatus === 'approved' && !req.appointmentDate && (
                          <span className="text-[10px] text-amber-700 font-semibold">(Awaiting admin scheduling)</span>
                        )}
                      </div>
                    ) : null}
                    <div className="text-slate-600 text-[11px]">
                      Contact: {req.contactPersonName} ({req.contactNumber})
                    </div>
                    {req.remarks && (
                      <div className="text-slate-600 text-[11px] italic bg-white p-1.5 rounded border border-slate-200 mt-1">
                        "{req.remarks}"
                      </div>
                    )}
                    {(req.completedAt || (card.availments?.[0]?.id === req.id ? card.completedAt : undefined)) && (
                      <div className="text-emerald-800 font-bold text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed: {new Date(req.completedAt || card.completedAt!).toLocaleString()}
                      </div>
                    )}
                    {((req.completionPhotos && req.completionPhotos.length > 0) ||
                      (card.availments?.[0]?.id === req.id && card.completionPhotos && card.completionPhotos.length > 0)) && (
                      <div className="pt-1 flex items-center gap-1 overflow-x-auto">
                        <span className="text-[10px] text-emerald-700 font-bold shrink-0">Completion proof:</span>
                        {(req.completionPhotos || card.completionPhotos || []).map((pUrl, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => setPreviewImage(pUrl)}
                            className="w-8 h-8 rounded border border-emerald-300 overflow-hidden shrink-0"
                          >
                            <img src={pUrl} alt={`Completion proof ${pIdx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {req.photos && req.photos.length > 0 && (
                      <div className="pt-1 flex items-center gap-1 overflow-x-auto">
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">Photos:</span>
                        {req.photos.map((pUrl, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => setPreviewImage(pUrl)}
                            className="w-8 h-8 rounded border border-slate-300 overflow-hidden shrink-0"
                          >
                            <img src={pUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>
      {/* FULLSIZE PHOTO PREVIEW MODAL */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <h3 className="font-extrabold text-sm text-slate-900">Attached Photo Preview</h3>
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

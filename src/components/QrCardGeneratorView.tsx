import React, { useState } from 'react';
import { QrCard, ManagedUser, QrCardStatus, AdminUserProfile, ServiceAvailment } from '../types';
import { calculateUnavailedExpiryDate, isQrCardFullyUsed, isQrCardUsed } from '../lib/userService';
import { QrCodeCanvas } from './QrCodeCanvas';
import { PaginationControls } from './PaginationControls';
import {
  QrCode,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  XCircle,
  Users,
  Calendar,
  Sparkles,
  Search,
  Filter,
  Check,
  Tag,
  Download,
  Eye,
  Scan,
  X,
  CreditCard,
  Building2,
  Copy,
  ExternalLink,
  Pencil,
  LayoutGrid,
  List,
  AlertTriangle,
  UserCheck,
  CheckSquare,
  Square,
  MapPin,
  Phone,
  ShieldCheck
} from 'lucide-react';

interface QrCardGeneratorViewProps {
  qrCards: QrCard[];
  managedUsers: ManagedUser[];
  currentAdminUid: string;
  profile?: AdminUserProfile | null;
  onCreateBulk: (params: {
    cardTitle: string;
    services: string[];
    validUntil: string;
    targetUsers: Array<{ id?: string; name?: string; email?: string }>;
    quantityPerUser?: number;
    allowCustomRequest?: boolean;
    customRequestInstructions?: string;
  }) => Promise<void>;
  onUpdateStatus: (id: string, status: QrCardStatus) => Promise<void>;
  onRestoreService?: (cardCode: string, availmentId: string, serviceName: string) => Promise<QrCard>;
  onUpdateDetails?: (
    id: string,
    data: Partial<
      Pick<
        QrCard,
        | 'cardTitle'
        | 'assignedUserId'
        | 'assignedUserName'
        | 'assignedUserEmail'
        | 'services'
        | 'validUntil'
        | 'status'
        | 'allowCustomRequest'
        | 'customRequestInstructions'
      >
    >
  ) => Promise<void>;
  onDeleteCard: (id: string) => Promise<void>;
  onDeleteBulkCards?: (ids: string[]) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const PRESET_SERVICES = [
  'Canopy Service',
  'Price sign repair',
  'Powerwash',
  'Paint Touchup',
];

export const QrCardGeneratorView: React.FC<QrCardGeneratorViewProps> = ({
  qrCards,
  managedUsers,
  currentAdminUid,
  profile,
  onCreateBulk,
  onUpdateStatus,
  onRestoreService,
  onUpdateDetails,
  onDeleteCard,
  onDeleteBulkCards,
  onSuccess,
  onError
}) => {
  // Check admin role
  const isAdmin = profile?.role === 'admin' || !!currentAdminUid;

  const handleRestoreService = async (card: QrCard, availment: ServiceAvailment, serviceName: string): Promise<QrCard | null> => {
    if (!onRestoreService || !window.confirm(`Restore "${serviceName}" to this card?`)) return null;
    const restoreKey = `${availment.id}:${serviceName}`;
    setRestoringService(restoreKey);
    try {
      const updatedCard = await onRestoreService(card.cardCode, availment.id, serviceName);
      onSuccess(`${serviceName} restored to the card.`);
      return updatedCard;
    } catch (error: any) {
      onError(error?.message || 'Failed to restore service.');
      return null;
    } finally {
      setRestoringService(null);
    }
  };

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [previewCard, setPreviewCard] = useState<QrCard | null>(null);
  const [editingCard, setEditingCard] = useState<QrCard | null>(null);
  const [deletingCard, setDeletingCard] = useState<QrCard | null>(null);
  const [restoringService, setRestoringService] = useState<string | null>(null);

  // Credit Card Print Modal state
  const [printModalCards, setPrintModalCards] = useState<QrCard[] | null>(null);

  // Bulk Selection & Bulk Delete state
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  // View Mode state: Default to Table (List View)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const QR_CARDS_PAGE_SIZE = 10;

  // Creation Form State
  const [cardTitle, setCardTitle] = useState('Power Wash & Facility Service Pass');
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'Canopy Service',
    'Price sign repair',
    'Powerwash',
    'Paint Touchup',
  ]);
  const [customServiceInput, setCustomServiceInput] = useState('');
  const [allowCustomRequest, setAllowCustomRequest] = useState(true);
  const [customRequestInstructions, setCustomRequestInstructions] = useState('');
  const [validUntil, setValidUntil] = useState(() => calculateUnavailedExpiryDate());

  // Assignment Mode & Quantity Selector (Presets: 100, 200, 500, custom)
  const [cardQuantity, setCardQuantity] = useState<number>(100);
  const [quantityPreset, setQuantityPreset] = useState<'100' | '200' | '500' | 'custom'>('100');
  const [customQuantityInput, setCustomQuantityInput] = useState<string>('100');
  const [assignmentMode, setAssignmentMode] = useState<'selected' | 'internal'>('selected');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Internal assignment state
  const [internalName, setInternalName] = useState<string>('Internal Staff Member');
  const [internalEmail, setInternalEmail] = useState<string>('internal.staff@facility.com');

  const [submitting, setSubmitting] = useState(false);

  // Edit Modal Form State
  const [editTitle, setEditTitle] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editServices, setEditServices] = useState<string[]>([]);
  const [editAllowCustomRequest, setEditAllowCustomRequest] = useState(true);
  const [editCustomRequestInstructions, setEditCustomRequestInstructions] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editStatus, setEditStatus] = useState<QrCardStatus>('active');
  const [updatingDetails, setUpdatingDetails] = useState(false);

  // Scanner Simulator state
  const [scanInput, setScanInput] = useState('');
  const [scannedResult, setScannedResult] = useState<QrCard | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Departments list from managed users
  const departments = Array.from(new Set(managedUsers.map((u) => u.department).filter(Boolean)));

  // Service toggle helper for creation
  const toggleService = (svc: string) => {
    if (selectedServices.includes(svc)) {
      setSelectedServices(selectedServices.filter((s) => s !== svc));
    } else {
      setSelectedServices([...selectedServices, svc]);
    }
  };

  const handleAddCustomService = () => {
    const trimmed = customServiceInput.trim();
    if (trimmed && !selectedServices.includes(trimmed)) {
      setSelectedServices([...selectedServices, trimmed]);
      setCustomServiceInput('');
    }
  };

  // Creation Submit
  const handleCreateCardsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedServices.length === 0) {
      onError('Please select at least one service to include on the QR Card.');
      return;
    }

    const qtyToGenerate = Math.max(1, cardQuantity || 100);
    let targetUsersList: Array<{ id?: string; name?: string; email?: string }> = [];

    if (assignmentMode === 'selected') {
      if (selectedUserIds.length === 0) {
        onError('Mandatory: Please select at least one managed user to assign cards.');
        return;
      }
      const selectedUsers = managedUsers.filter((u) => selectedUserIds.includes(u.id));
      if (selectedUsers.length === 1) {
        // Generate exactly qtyToGenerate cards for the single selected user
        for (let i = 1; i <= qtyToGenerate; i++) {
          targetUsersList.push({
            id: selectedUsers[0].id,
            name: qtyToGenerate > 1 ? `${selectedUsers[0].displayName} (Pass #${i})` : selectedUsers[0].displayName,
            email: selectedUsers[0].email
          });
        }
      } else {
        // Generate exactly qtyToGenerate cards distributed evenly across the selected users
        for (let i = 0; i < qtyToGenerate; i++) {
          const user = selectedUsers[i % selectedUsers.length];
          const passNumber = Math.floor(i / selectedUsers.length) + 1;
          targetUsersList.push({
            id: user.id,
            name: `${user.displayName} (Pass #${passNumber})`,
            email: user.email
          });
        }
      }
    } else if (assignmentMode === 'internal') {
      const name = internalName.trim() || 'Internal Staff Member';
      const email = internalEmail.trim() || 'internal.staff@facility.com';
      for (let i = 1; i <= qtyToGenerate; i++) {
        targetUsersList.push({
          name: qtyToGenerate > 1 ? `${name} (Pass #${i})` : name,
          email: email
        });
      }
    }

    if (targetUsersList.length === 0) {
      onError('Every QR card must be assigned to an individual before generation.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateBulk({
        cardTitle,
        services: selectedServices,
        allowCustomRequest,
        customRequestInstructions: customRequestInstructions.trim(),
        validUntil,
        targetUsers: targetUsersList,
        quantityPerUser: 1
      });
      onSuccess(`Successfully generated ${targetUsersList.length} cards! Each card has a unique QR code and unique verification link.`);
      setShowCreateModal(false);
    } catch (err: any) {
      onError(err.message || 'Failed to generate QR cards.');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Modal Setup
  const handleOpenEditModal = (card: QrCard) => {
    setEditingCard(card);
    setEditTitle(card.cardTitle);
    setEditUserName(card.assignedUserName || '');
    setEditUserEmail(card.assignedUserEmail || '');
    setEditServices(card.services || []);
    setEditAllowCustomRequest(card.allowCustomRequest !== false);
    setEditCustomRequestInstructions(card.customRequestInstructions || '');
    setEditValidUntil(card.validUntil || '');
    setEditStatus(card.status || 'active');
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    if (!editUserName.trim()) {
      onError('Cardholder assigned name is required.');
      return;
    }

    setUpdatingDetails(true);
    try {
      if (onUpdateDetails) {
        await onUpdateDetails(editingCard.id, {
          cardTitle: editTitle,
          assignedUserName: editUserName,
          assignedUserEmail: editUserEmail,
          services: editServices,
          allowCustomRequest: editAllowCustomRequest,
          customRequestInstructions: editCustomRequestInstructions.trim(),
          validUntil: editValidUntil,
          status: editStatus
        });
      } else {
        await onUpdateStatus(editingCard.id, editStatus);
      }
      onSuccess(`Card ${editingCard.cardCode} details updated successfully.`);
      setEditingCard(null);
    } catch (err: any) {
      onError(err.message || 'Failed to update card details.');
    } finally {
      setUpdatingDetails(false);
    }
  };

  // Single Delete Confirm
  const handleConfirmDelete = async () => {
    if (!deletingCard) return;
    try {
      await onDeleteCard(deletingCard.id);
      onSuccess(`Card ${deletingCard.cardCode} deleted.`);
      setDeletingCard(null);
      setSelectedCardIds((prev) => prev.filter((id) => id !== deletingCard.id));
    } catch (err: any) {
      onError('Failed to delete QR card.');
    }
  };

  // In-memory categorized metrics (0 extra Firebase calls)
  const { unusedCount, usedCount } = React.useMemo(() => {
    let unused = 0;
    let used = 0;
    for (const card of qrCards) {
      if (card.availments && card.availments.length > 0) {
        used++;
      } else {
        unused++;
      }
    }
    return { unusedCount: unused, usedCount: used };
  }, [qrCards]);

  // Filtered Cards list
  const filteredCards = qrCards.filter((card) => {
    const availments = card.availments || [];
    const latestAvailment = availments.length > 0 ? availments[0] : null;
    const addr = latestAvailment?.address;
    const fullAddrStr = addr
      ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
      : '';

    const matchesSearch =
      card.cardTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.cardCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.assignedUserName && card.assignedUserName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (card.assignedUserEmail && card.assignedUserEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (latestAvailment?.contactPersonName && latestAvailment.contactPersonName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (fullAddrStr && fullAddrStr.toLowerCase().includes(searchTerm.toLowerCase())) ||
      card.services.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesStatus = true;
    if (statusFilter === 'active') {
      matchesStatus = card.status === 'active';
    } else if (statusFilter === 'revoked') {
      matchesStatus = card.status === 'revoked';
    } else if (statusFilter === 'not_used') {
      matchesStatus = !card.availments || card.availments.length === 0;
    } else if (statusFilter === 'used') {
      matchesStatus = isQrCardUsed(card);
    } else if (statusFilter === 'expired') {
      matchesStatus = card.status === 'expired';
    }

    return matchesSearch && matchesStatus;
  });

  const paginatedCards = filteredCards.slice(
    (currentPage - 1) * QR_CARDS_PAGE_SIZE,
    currentPage * QR_CARDS_PAGE_SIZE
  );

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  // Selection Logic
  const toggleSelectCard = (id: string) => {
    if (selectedCardIds.includes(id)) {
      setSelectedCardIds(selectedCardIds.filter((item) => item !== id));
    } else {
      setSelectedCardIds([...selectedCardIds, id]);
    }
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredCards.map((c) => c.id);
    const allSelected = filteredIds.every((id) => selectedCardIds.includes(id));
    if (allSelected) {
      setSelectedCardIds(selectedCardIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const combined = Array.from(new Set([...selectedCardIds, ...filteredIds]));
      setSelectedCardIds(combined);
    }
  };

  const isAllFilteredSelected =
    filteredCards.length > 0 && filteredCards.every((c) => selectedCardIds.includes(c.id));

  // Confirm Bulk Delete Handler
  const handleConfirmBulkDelete = async () => {
    if (selectedCardIds.length === 0) return;
    setDeletingBulk(true);
    try {
      if (onDeleteBulkCards) {
        await onDeleteBulkCards(selectedCardIds);
      } else {
        await Promise.all(selectedCardIds.map((id) => onDeleteCard(id)));
      }
      onSuccess(`Successfully deleted ${selectedCardIds.length} QR cards.`);
      setSelectedCardIds([]);
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      onError(err.message || 'Failed to bulk delete cards.');
    } finally {
      setDeletingBulk(false);
    }
  };

  // Scan lookup handler
  const handleScanLookup = () => {
    const queryStr = scanInput.trim().toLowerCase();
    if (!queryStr) return;

    let found = qrCards.find(
      (c) =>
        c.cardCode.toLowerCase() === queryStr ||
        c.id.toLowerCase() === queryStr ||
        c.qrData.toLowerCase().includes(queryStr)
    );

    if (!found) {
      try {
        const parsed = JSON.parse(scanInput);
        if (parsed.cardId) {
          found = qrCards.find((c) => c.id === parsed.cardId);
        }
      } catch (e) {
        // Not valid JSON
      }
    }

    if (found) {
      setScannedResult(found);
      setScanError(null);
    } else {
      setScannedResult(null);
      setScanError('No active service card found matching scan payload or code.');
    }
  };

  // Batch Print Credit Cards Handler
  const handleBatchPrint = () => {
    const targetCards = selectedCardIds.length > 0
      ? qrCards.filter((c) => selectedCardIds.includes(c.id))
      : filteredCards;
    if (targetCards.length === 0) {
      onError('No QR service cards selected or available to print.');
      return;
    }
    setPrintModalCards(targetCards);
  };

  // Single Card Credit Card Print Handler
  const handlePrintSingleCard = (card: QrCard) => {
    setPrintModalCards([card]);
  };

  // Copy Verification Link
  const handleCopyLink = (card: QrCard) => {
    const url = card.verificationUrl || card.qrData;
    navigator.clipboard.writeText(url);
    onSuccess(`Copied unique link for card ${card.cardCode}`);
  };

  // Export Cards & All Detailed Data as CSV
  const handleExportCsv = () => {
    if (filteredCards.length === 0) {
      onError('No QR cards available to export.');
      return;
    }

    const headers = [
      'Card ID',
      'Card Code',
      'Card Title',
      'Pass Status',
      'Assigned Holder Name',
      'Assigned Holder Email',
      'Assigned User ID',
      'Valid Until Date',
      'Created Date',
      'Included Services',
      'Total Services Count',
      'Availed Unique Services',
      'Total Service Calls Count',
      'Latest Service Date',
      'Latest Contact Person',
      'Latest Contact Phone',
      'Latest Service Street Address',
      'Latest Service Apt/Suite',
      'Latest Service City',
      'Latest Service State',
      'Latest Service Zip Code',
      'Latest Full Service Address',
      'Latest Remarks',
      'Latest Service Status',
      'Latest Completed Date',
      'Latest Attached Photos Count',
      'Public Pass Verification Link'
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = filteredCards.map((c) => {
      const availments = c.availments || [];
      const latest = availments.length > 0 ? availments[0] : null;
      const addr = latest?.address;
      const formattedAddress = addr
        ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
        : '';

      const availedServicesSet = new Set<string>();
      availments.forEach((a) => {
        if (a.requestedServices) {
          a.requestedServices.forEach((s) => availedServicesSet.add(s.trim()));
        }
      });

      return [
        escapeCsv(c.id),
        escapeCsv(c.cardCode),
        escapeCsv(c.cardTitle),
        escapeCsv(c.status),
        escapeCsv(c.assignedUserName || 'Unassigned'),
        escapeCsv(c.assignedUserEmail || ''),
        escapeCsv(c.assignedUserId || ''),
        escapeCsv(c.validUntil),
        escapeCsv(c.createdAt ? new Date(c.createdAt).toLocaleString() : ''),
        escapeCsv(c.services ? c.services.join('; ') : ''),
        escapeCsv(c.services ? c.services.length.toString() : '0'),
        escapeCsv(Array.from(availedServicesSet).join('; ')),
        escapeCsv(availments.length.toString()),
        escapeCsv(latest?.appointmentDate || (latest?.timestamp ? new Date(latest.timestamp).toLocaleDateString() : '')),
        escapeCsv(latest?.contactPersonName || ''),
        escapeCsv(latest?.contactNumber || ''),
        escapeCsv(addr?.streetAddress || ''),
        escapeCsv(addr?.aptSuite || ''),
        escapeCsv(addr?.city || ''),
        escapeCsv(addr?.state || ''),
        escapeCsv(addr?.zipCode || ''),
        escapeCsv(formattedAddress),
        escapeCsv(latest?.remarks || ''),
        escapeCsv(latest?.status || 'N/A'),
        escapeCsv(latest?.completedAt ? new Date(latest.completedAt).toLocaleString() : ''),
        escapeCsv((latest?.photos || []).length.toString()),
        escapeCsv(c.verificationUrl || c.qrData)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `QR_Service_Cards_${filteredCards.length}_Complete_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onSuccess(`Successfully exported complete data for ${filteredCards.length} QR cards to CSV!`);
  };

  const handleExportServiceCallsCSV = () => {
    // Collect all availments across filtered cards
    const allCalls: { card: QrCard; availment: ServiceAvailment }[] = [];
    filteredCards.forEach((c) => {
      (c.availments || []).forEach((a) => {
        allCalls.push({ card: c, availment: a });
      });
    });

    if (allCalls.length === 0) {
      onError('No service calls / requests found across these cards to export.');
      return;
    }

    const headers = [
      'Service Request ID',
      'Appointment Date',
      'Booked Date & Time',
      'Service Status',
      'Card Code',
      'Card Title',
      'Pass Status',
      'Assigned Holder Name',
      'Assigned Holder Email',
      'Contact Person Name',
      'Contact Phone Number',
      'Street Address',
      'Apt / Suite',
      'City',
      'State',
      'Zip Code',
      'Full Service Address',
      'Requested Services List',
      'Customer Remarks / Notes',
      'Customer Photos Count',
      'Customer Photos Info',
      'Completed Date & Time',
      'Admin Proof Photos Count',
      'Admin Proof Photos Info',
      'Public Pass Verification Link'
    ];

    const escapeCsv = (str: string | undefined | null) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const formatPhotoSummary = (photosList?: string[]) => {
      if (!photosList || photosList.length === 0) return 'No photos';
      return photosList
        .map((p, i) => (p.startsWith('data:image') ? `[Attached Photo ${i + 1} (${Math.round(p.length / 1024)} KB)]` : p))
        .join('; ');
    };

    const rows = allCalls.map(({ card, availment: a }) => {
      const addr = a.address;
      const formattedAddress = addr
        ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
        : '';

      return [
        escapeCsv(a.id),
        escapeCsv(a.appointmentDate || ''),
        escapeCsv(a.timestamp ? new Date(a.timestamp).toLocaleString() : ''),
        escapeCsv(a.status || 'pending'),
        escapeCsv(card.cardCode),
        escapeCsv(card.cardTitle),
        escapeCsv(card.status),
        escapeCsv(card.assignedUserName || 'Unassigned'),
        escapeCsv(card.assignedUserEmail || ''),
        escapeCsv(a.contactPersonName || ''),
        escapeCsv(a.contactNumber || ''),
        escapeCsv(addr?.streetAddress || ''),
        escapeCsv(addr?.aptSuite || ''),
        escapeCsv(addr?.city || ''),
        escapeCsv(addr?.state || ''),
        escapeCsv(addr?.zipCode || ''),
        escapeCsv(formattedAddress),
        escapeCsv((a.requestedServices || []).join('; ')),
        escapeCsv(a.remarks || ''),
        escapeCsv((a.photos || []).length.toString()),
        escapeCsv(formatPhotoSummary(a.photos)),
        escapeCsv(a.completedAt ? new Date(a.completedAt).toLocaleString() : ''),
        escapeCsv((a.completionPhotos || []).length.toString()),
        escapeCsv(formatPhotoSummary(a.completionPhotos)),
        escapeCsv(card.verificationUrl || card.qrData)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Service_Calls_Ledger_${allCalls.length}_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onSuccess(`Successfully exported ${allCalls.length} service request calls to CSV!`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">QR Card Generator & Service Passes</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create assigned QR cards with unique verification links for Canopy Service, Price sign repair, Powerwash & Paint Touchup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowScanModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200"
          >
            <Scan className="w-4 h-4 text-slate-600" />
            Scan / Verify Card
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
            title="Export summary list of cards with unique links as CSV"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Export Cards CSV
          </button>
          <button
            onClick={handleBatchPrint}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700"
          >
            <Printer className="w-4 h-4" />
            Print Cards(Passes)
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            Generate Service QR Cards
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Cards</span>
            <CreditCard className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900">{qrCards.length}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Active / Unused Cards</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-extrabold text-emerald-600">{unusedCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Active / Used Cards</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-extrabold text-blue-600">{usedCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Holders</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-2xl font-extrabold text-indigo-600">
            {new Set(qrCards.map((c) => c.assignedUserName).filter(Boolean)).size}
          </span>
        </div>
      </div>

      {/* Filter, Search & View Toggle Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search title, assigned holder, code, or service..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Passes ({qrCards.length})</option>
              <option value="not_used">🟢 Active / Unused ({unusedCount})</option>
              <option value="used">🔵 Active / Used ({usedCount})</option>
              <option value="active">Active / Unused Only</option>
              <option value="revoked">Revoked / Disabled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Grid vs Table View Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List View
            </button>
          </div>
        </div>
      </div>

      {/* BULK SELECTION ACTION BAR */}
      <div className="bg-slate-900 text-white p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSelectAllFiltered}
            className="flex items-center gap-2 text-xs font-bold hover:text-blue-300 transition-colors"
          >
            {isAllFilteredSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>
              {isAllFilteredSelected ? 'Deselect All Visible' : `Select All Visible (${filteredCards.length})`}
            </span>
          </button>

          {selectedCardIds.length > 0 && (
            <span className="px-2.5 py-0.5 bg-blue-600 text-white font-mono font-bold text-xs rounded-full">
              {selectedCardIds.length} Selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {selectedCardIds.length > 0 && (
            <>
              <button
                onClick={() => setSelectedCardIds([])}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleBatchPrint}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Selected ({selectedCardIds.length})
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (selectedCardIds.length === 0) {
                onError('Please select at least one card to bulk delete.');
                return;
              }
              setShowBulkDeleteModal(true);
            }}
            disabled={selectedCardIds.length === 0}
            className={`px-4 py-1.5 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 ${
              selectedCardIds.length > 0
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-sm cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected ({selectedCardIds.length})
          </button>
        </div>
      </div>

      {/* Main Content: Grid vs Table List View */}
      {filteredCards.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">No QR Service Cards Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Generate assigned QR service cards for individuals or batch recipients with Power Wash & Touchup services.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-lg shadow-sm hover:bg-blue-500 transition-colors inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> Generate Service QR Cards
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (Cards Visual Grid with selection checkbox) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2 print:gap-4">
          {paginatedCards.map((card) => {
            const isRevoked = card.status === 'revoked';
            const isExpiredStatus = card.status === 'expired';
            const isUsed = !isRevoked && !isExpiredStatus && isQrCardUsed(card);
            const isExpired = new Date(card.validUntil) < new Date();
            const isSelected = selectedCardIds.includes(card.id);

            return (
              <div
                key={card.id}
                className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col justify-between relative group print:break-inside-avoid ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                    : 'border-slate-200 shadow-sm hover:shadow-md'
                }`}
              >
                {/* Selection Checkbox Overlay Header */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 text-white p-4 relative">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectCard(card.id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                      />
                      <div>
                        <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
                          ACCESS PASS CARD
                        </span>
                        <h3 className="font-extrabold text-sm text-white tracking-tight">{card.cardTitle}</h3>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-blue-200 bg-white/10 px-2 py-0.5 rounded border border-white/20 shrink-0">
                      {card.cardCode}
                    </span>
                  </div>

                  {(() => {
                    const availments = card.availments || [];
                    const latestAvailment = availments.length > 0 ? availments[0] : null;
                    const addr = latestAvailment?.address;
                    const formattedAddress = addr
                      ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                      : '';

                    if (latestAvailment || card.savedContactName) {
                      const contactName = card.savedContactName || latestAvailment?.contactPersonName || 'Customer / Card Holder';
                      return (
                        <div className="mt-3 p-2 bg-emerald-950/60 rounded-lg border border-emerald-500/30 text-[11px]">
                          <div className="flex items-center justify-between text-emerald-300 font-bold text-[10px] uppercase tracking-wider mb-0.5">
                            <span className="flex items-center gap-1"><UserCheck className="w-3 h-3 text-emerald-400" /> Contact Person</span>
                            {availments.length > 0 && (
                              <span className="bg-emerald-500/20 text-emerald-200 text-[9px] px-1.5 py-0.2 rounded border border-emerald-400/30">Used ({availments.length}x)</span>
                            )}
                          </div>
                          <div className="font-extrabold text-white text-xs">{contactName}</div>
                          {formattedAddress && (
                            <div className="text-[10px] text-emerald-100/90 flex items-start gap-1 mt-1 font-medium">
                              <MapPin className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{formattedAddress}</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Contact Person</span>
                          <span className="font-semibold text-white">
                            {card.savedContactName || 'Customer / Card Holder'}
                          </span>
                        </div>
                        {card.savedContactEmail ? (
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {card.savedContactEmail}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 italic">Not availed yet</span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* QR Code Canvas + Details */}
                <div className="p-4 flex items-center gap-4">
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0 flex items-center justify-center">
                    <QrCodeCanvas value={card.verificationUrl || card.qrData} size={110} />
                  </div>

                  <div className="space-y-2 flex-1 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        STATUS
                      </span>
                      <select
                        value={isRevoked || isExpiredStatus ? card.status : isUsed ? 'used' : card.status === 'used' ? 'active' : card.status}
                        onChange={(e) => onUpdateStatus(card.id, e.target.value as QrCardStatus)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                          isRevoked || isExpired
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : isUsed
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <option value="active">Active / Unused</option>
                        <option value="used">Active / Used</option>
                        <option value="revoked">Revoked</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        VALID UNTIL
                      </span>
                      <span className="font-semibold text-slate-700 text-xs">
                        {card.validUntil}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                        UNIQUE SCAN LINK
                      </span>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-0.5 min-w-0">
                        <button
                          onClick={() => handleCopyLink(card)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium truncate w-full sm:max-w-[100px] block hover:underline text-left min-h-8 sm:min-h-0"
                          title="Click to copy unique card link"
                        >
                          {card.verificationUrl || card.qrData}
                        </button>
                        <a
                          href={card.verificationUrl || card.qrData}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-700 hover:text-blue-800 font-bold flex items-center justify-center gap-0.5 w-full sm:w-auto min-h-8 sm:min-h-0 bg-blue-50 hover:bg-blue-100 px-1.5 py-1 sm:py-0.5 rounded border border-blue-200 transition-colors"
                          title="Go to this link"
                        >
                          <ExternalLink className="w-2.5 h-2.5 text-blue-600" /> Go to link
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Services Tags */}
                <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap gap-1 items-center">
                  {card.services.map((svc, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-medium bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                    >
                      {svc}
                    </span>
                  ))}
                  {card.allowCustomRequest !== false && (
                    <span className="text-[10px] font-extrabold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Custom Req
                    </span>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs print:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewCard(card)}
                      className="text-slate-600 hover:text-blue-600 font-semibold text-[11px] flex items-center gap-1"
                      title="View Pass"
                    >
                      <Eye className="w-3 h-3" /> View Pass
                    </button>
                    <button
                      onClick={() => handleCopyLink(card)}
                      className="text-slate-600 hover:text-blue-600 font-semibold text-[11px] flex items-center gap-1"
                      title="Copy unique verification link"
                    >
                      <Copy className="w-3 h-3 text-blue-500" /> Copy Link
                    </button>
                    <a
                      href={card.verificationUrl || card.qrData}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-600 hover:text-blue-600 font-semibold text-[11px] flex items-center gap-1"
                      title="Go to this link"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-500" /> Go to link
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button
                        onClick={() => handlePrintSingleCard(card)}
                        className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-bold text-[10px] rounded border border-slate-200 flex items-center gap-1 transition-colors"
                        title="Print Service Pass (Front & Back PDF)"
                      >
                        <CreditCard className="w-3 h-3 text-blue-600" /> Print Pass
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEditModal(card)}
                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit Card Details"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingCard(card)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete Card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                    />
                  </th>
                  <th className="py-3 px-4">Card Code & Title</th>
                  <th className="py-3 px-4">Holder / Availed Address</th>
                  <th className="py-3 px-4">Included Services</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Valid Until</th>
                  <th className="py-3 px-4">Unique Link</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedCards.map((card) => {
                  const isSelected = selectedCardIds.includes(card.id);
                  return (
                    <tr
                      key={card.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* Checkbox Column */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCard(card.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                        />
                      </td>

                      {/* Code & Title */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900 font-mono text-xs">{card.cardCode}</div>
                        <div className="text-slate-500 text-[11px]">{card.cardTitle}</div>
                      </td>

                      {/* Holder / Availed Address */}
                      <td className="py-3 px-4">
                        {(() => {
                          const availments = card.availments || [];
                          const latestAvailment = availments.length > 0 ? availments[0] : null;
                          const addr = latestAvailment?.address;
                          const formattedAddress = addr
                            ? `${addr.streetAddress}${addr.aptSuite ? ', ' + addr.aptSuite : ''}, ${addr.city}, ${addr.state} ${addr.zipCode}`
                            : '';

                          if (latestAvailment || card.savedContactName) {
                            const contactName = card.savedContactName || latestAvailment?.contactPersonName || 'Customer / Card Holder';
                            return (
                              <div className="space-y-1 max-w-xs">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span>{contactName}</span>
                                  {availments.length > 0 && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded border border-emerald-200">
                                      Availed ({availments.length}x)
                                    </span>
                                  )}
                                </div>
                                {formattedAddress && (
                                  <div className="text-[11px] text-slate-700 flex items-start gap-1 font-medium bg-slate-50 p-1.5 rounded border border-slate-200/80">
                                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                    <span className="break-words">{formattedAddress}</span>
                                  </div>
                                )}
                                {(latestAvailment?.contactNumber || card.savedContactPhone) && (
                                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{latestAvailment?.contactNumber || card.savedContactPhone}</span>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div>
                              <div className="font-bold text-slate-800 flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>{card.savedContactName || 'Customer / Card Holder'}</span>
                              </div>
                              {card.savedContactEmail ? (
                                <div className="text-[10px] text-slate-400">{card.savedContactEmail}</div>
                              ) : (
                                <div className="text-[10px] text-slate-400 italic mt-0.5">Not availed yet</div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Included Services Badges */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1 items-center">
                          {card.services.map((svc, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100"
                            >
                              {svc}
                            </span>
                          ))}
                          {card.allowCustomRequest !== false && (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-extrabold rounded border border-purple-200 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Custom Req
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <select
                            value={card.status === 'revoked' || card.status === 'expired' ? card.status : isQrCardUsed(card) ? 'used' : card.status === 'used' ? 'active' : card.status}
                          onChange={(e) => onUpdateStatus(card.id, e.target.value as QrCardStatus)}
                          className={`text-[11px] font-bold px-2 py-1 rounded border ${
                            card.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : card.status === 'revoked' || card.status === 'expired'
                              ? false
                              : isQrCardUsed(card)
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          <option value="active">Active / Unused</option>
                          <option value="used">Active / Used</option>
                          <option value="revoked">Revoked</option>
                          <option value="expired">Expired</option>
                        </select>
                      </td>

                      {/* Valid Until */}
                      <td className="py-3 px-4 text-slate-600 font-semibold">{card.validUntil}</td>

                      {/* Unique Link */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyLink(card)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-blue-600 text-[11px] font-bold rounded border border-slate-200 flex items-center gap-1 transition-colors shrink-0"
                            title="Copy Unique Verification Link"
                          >
                            <Copy className="w-3 h-3 text-blue-500" /> Copy Link
                          </button>
                          <a
                            href={card.verificationUrl || card.qrData}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 text-[11px] font-bold rounded border border-slate-200 flex items-center gap-1 transition-colors shrink-0"
                            title="Go to this link"
                          >
                            <ExternalLink className="w-3 h-3 text-slate-500" /> Go to link
                          </a>
                        </div>
                      </td>

                      {/* Operations: View, Print, Edit, Delete */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setPreviewCard(card)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View Pass"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handlePrintSingleCard(card)}
                              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                              title="Print Service Pass (Front & Back PDF)"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(card)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit Card Details"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingCard(card)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Card"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredCards.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <PaginationControls
            currentPage={currentPage}
            totalItems={filteredCards.length}
            pageSize={QR_CARDS_PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* MODAL 1: Create Bulk Cards Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 bg-gradient-to-r from-slate-900 to-blue-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-base">Generate Assigned QR Service Cards</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCardsSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-blue-800 text-xs flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Mandatory Assignment:</strong> All QR cards must be assigned to an individual user before creation.
                </span>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Card Title</label>
                <input
                  type="text"
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* NUMBER OF CARDS TO GENERATE (PRESETS: 100, 200, 500, CUSTOM) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    Number of Cards to Generate
                  </label>
                  <span className="text-xs font-mono font-black text-blue-700 bg-blue-100/80 px-2.5 py-0.5 rounded-full border border-blue-200">
                    Total: {cardQuantity} {cardQuantity === 1 ? 'Card' : 'Cards'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {([100, 200, 500] as const).map((preset) => {
                    const isSelected = quantityPreset === String(preset) && cardQuantity === preset;
                    return (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => {
                          setQuantityPreset(String(preset) as any);
                          setCardQuantity(preset);
                          setCustomQuantityInput(String(preset));
                        }}
                        className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all text-center border flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500/30 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-base font-black">{preset}</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold opacity-90">Cards</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setQuantityPreset('custom');
                      if ([100, 200, 500].includes(cardQuantity)) {
                        setCardQuantity(50);
                        setCustomQuantityInput('50');
                      }
                    }}
                    className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all text-center border flex flex-col items-center justify-center gap-1 ${
                      quantityPreset === 'custom' || ![100, 200, 500].includes(cardQuantity)
                        ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-500/30 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-base font-black">
                      {quantityPreset === 'custom' || ![100, 200, 500].includes(cardQuantity) ? cardQuantity : 'Custom'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-90">Custom Qty</span>
                  </button>
                </div>

                {/* Custom Quantity Input Field if Custom is selected */}
                {(quantityPreset === 'custom' || ![100, 200, 500].includes(cardQuantity)) && (
                  <div className="bg-white p-3 rounded-xl border border-blue-200 flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="space-y-0.5">
                      <label className="block text-[11px] font-bold text-slate-800">
                        Enter Custom Card Quantity:
                      </label>
                      <p className="text-[10px] text-slate-500">
                        Specify exact number of cards to generate (1 to 1,000)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={customQuantityInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCustomQuantityInput(raw);
                          const val = Number(raw);
                          if (!isNaN(val) && val >= 1) {
                            setCardQuantity(Math.min(1000, val));
                          }
                        }}
                        onBlur={() => {
                          const val = Math.max(1, Math.min(1000, Number(customQuantityInput) || 1));
                          setCardQuantity(val);
                          setCustomQuantityInput(String(val));
                        }}
                        required
                        className="w-24 px-3 py-1.5 bg-blue-50 border border-blue-300 rounded-lg text-sm font-black text-blue-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-600">Cards</span>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50/80 p-2.5 rounded-lg border border-blue-200/70 text-blue-900 text-xs flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Generating <strong>{cardQuantity}</strong> cards will create exactly <strong>{cardQuantity} distinct QR codes</strong> and <strong>{cardQuantity} unique web verification links</strong> (e.g. <code className="bg-white px-1 py-0.5 rounded font-mono border border-blue-200 text-blue-900">/?cardId=...</code>).
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Included Services (Select items like Power Wash, Touchup, Canopy)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESET_SERVICES.map((svc) => {
                    const selected = selectedServices.includes(svc);
                    return (
                      <button
                        type="button"
                        key={svc}
                        onClick={() => toggleService(svc)}
                        className={`p-2 rounded-lg text-left text-xs font-semibold border transition-all flex items-center justify-between ${
                          selected
                            ? 'bg-blue-50 text-blue-800 border-blue-300 font-bold shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate pr-1">{svc}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customServiceInput}
                    onChange={(e) => setCustomServiceInput(e.target.value)}
                    placeholder="Add custom service name..."
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomService}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>

                <div className="min-h-8 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
                  <span className="mr-2 text-[10px] font-bold uppercase tracking-wide text-blue-700">Selected:</span>
                  {selectedServices.length > 0 ? (
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {selectedServices.map((svc) => (
                        <span key={svc} className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-900 border border-blue-200">
                          {svc}
                          <button
                            type="button"
                            onClick={() => toggleService(svc)}
                            className="text-blue-500 hover:text-blue-800"
                            aria-label={`Remove ${svc}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">No services selected</span>
                  )}
                </div>
              </div>

              {/* Custom Request Configuration */}
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-extrabold text-purple-950">Custom Request Option</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowCustomRequest}
                      onChange={(e) => setAllowCustomRequest(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-purple-800">
                  Allow customers to request unlisted custom services on this card. When a custom request is submitted, an email and in-app notification are dispatched to the assigned managed jobber and administrator. Only the managed user can accept or reject the request.
                </p>
                {allowCustomRequest && (
                  <div>
                    <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                      Custom Request Policy / Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      value={customRequestInstructions}
                      onChange={(e) => setCustomRequestInstructions(e.target.value)}
                      placeholder="e.g. Subject to jobber quote & preliminary assessment"
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-xs font-medium text-purple-950"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Valid Until / Default Expiry Date</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-500 italic mt-1 bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                  ℹ️ <strong>Card Validity Policy:</strong> Standard unavailed pass expires in <strong>2 years & 2 weeks</strong> from generated date. Once a service is availed for the first time, card validity automatically updates to <strong>1 year</strong> from that first service date.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-bold text-slate-800">
                  Assign Cards To (Choose Holder Target)
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentMode('selected')}
                    className={`p-3 rounded-xl border text-center text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      assignmentMode === 'selected'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Managed Users
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignmentMode('internal')}
                    className={`p-3 rounded-xl border text-center text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      assignmentMode === 'internal'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Internal / Admin Staff
                  </button>
                </div>

                {assignmentMode === 'selected' && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">
                        Select End Users ({selectedUserIds.length} chosen)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedUserIds.length === managedUsers.length) {
                            setSelectedUserIds([]);
                          } else {
                            setSelectedUserIds(managedUsers.map((u) => u.id));
                          }
                        }}
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        {selectedUserIds.length === managedUsers.length ? 'Deselect All' : 'Select All Users'}
                      </button>
                    </div>

                    {managedUsers.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No managed end users created yet.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {managedUsers.map((u) => {
                          const checked = selectedUserIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs font-medium cursor-pointer hover:bg-blue-50/50"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    if (checked) {
                                      setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                                    } else {
                                      setSelectedUserIds([...selectedUserIds, u.id]);
                                    }
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="font-bold text-slate-900">{u.displayName}</span>
                                <span className="text-slate-400">({u.email})</span>
                              </div>
                              <span className="text-[10px] text-slate-500 px-2 py-0.5 bg-slate-200/60 rounded">
                                {u.department}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {assignmentMode === 'internal' && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <label className="block text-xs font-bold text-slate-800">
                      Internal Staff / Admin Assignee Details
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Staff Name / Role
                        </label>
                        <input
                          type="text"
                          value={internalName}
                          onChange={(e) => setInternalName(e.target.value)}
                          placeholder="e.g. Internal Staff Member"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Staff Email
                        </label>
                        <input
                          type="email"
                          value={internalEmail}
                          onChange={(e) => setInternalEmail(e.target.value)}
                          placeholder="internal.staff@facility.com"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || (assignmentMode === 'selected' && selectedUserIds.length === 0)}
                  className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {submitting
                    ? 'Generating Cards...'
                    : assignmentMode === 'selected' && selectedUserIds.length === 0
                    ? 'Select User to Generate Pass'
                    : `Generate ${cardQuantity} QR Pass${cardQuantity === 1 ? '' : 'es'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Card Details Modal */}
      {editingCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-base">Edit QR Card Details ({editingCard.cardCode})</h3>
              </div>
              <button
                onClick={() => setEditingCard(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Card Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Assigned Holder Name</label>
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Assigned Holder Email</label>
                  <input
                    type="email"
                    value={editUserEmail}
                    onChange={(e) => setEditUserEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Pass Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as QrCardStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  <option value="active">Active / Unused</option>
                  <option value="used">Active / Used</option>
                  <option value="revoked">Revoked</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Valid Until</label>
                <input
                  type="date"
                  value={editValidUntil}
                  onChange={(e) => setEditValidUntil(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">Included Services</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_SERVICES.map((svc) => {
                    const checked = editServices.includes(svc);
                    return (
                      <label
                        key={svc}
                        className="flex items-center gap-2 p-2 rounded bg-slate-50 border border-slate-200 text-xs font-medium cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              setEditServices(editServices.filter((s) => s !== svc));
                            } else {
                              setEditServices([...editServices, svc]);
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{svc}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {editingCard.availments?.some((availment) => !availment.isCustomRequest && availment.requestedServices?.length) && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <label className="block text-xs font-semibold text-slate-700">Restore Availed Services</label>
                  <p className="text-[11px] text-slate-500">Restore a service if it was selected incorrectly. It will become available on the card again.</p>
                  {editingCard.availments
                    .filter((availment) => !availment.isCustomRequest && availment.requestedServices?.length)
                    .map((availment) => (
                      <div key={availment.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                        <div className="text-[10px] text-slate-500">{new Date(availment.timestamp).toLocaleString()}</div>
                        <div className="flex flex-wrap gap-1">
                          {availment.requestedServices.map((service) => {
                            const restoreKey = `${availment.id}:${service}`;
                            return (
                              <button
                                key={service}
                                type="button"
                                disabled={!onRestoreService || restoringService === restoreKey}
                                onClick={async () => {
                                  const updatedCard = await handleRestoreService(editingCard, availment, service);
                                  if (updatedCard) setEditingCard(updatedCard);
                                }}
                                className="text-[10px] font-semibold bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 hover:bg-amber-100 disabled:opacity-60"
                              >
                                {restoringService === restoreKey ? 'Restoring...' : `Restore ${service}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Edit Modal: Custom Request Option */}
              <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-extrabold text-purple-950">Custom Request Option</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowCustomRequest}
                      onChange={(e) => setEditAllowCustomRequest(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-purple-800">
                  Allow customers holding this card to request unlisted custom services.
                </p>
                {editAllowCustomRequest && (
                  <div>
                    <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                      Custom Request Policy / Instructions
                    </label>
                    <input
                      type="text"
                      value={editCustomRequestInstructions}
                      onChange={(e) => setEditCustomRequestInstructions(e.target.value)}
                      placeholder="e.g. Subject to jobber approval"
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-lg text-xs font-medium text-purple-950"
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCard(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingDetails}
                  className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all shadow-sm"
                >
                  {updatingDetails ? 'Saving Changes...' : 'Save Card Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Single Card Confirmation */}
      {deletingCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Delete QR Service Card?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete card <strong className="text-slate-900">{deletingCard.cardCode}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingCard(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-500 shadow-sm"
              >
                Delete Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: BULK DELETE CONFIRMATION */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Bulk Delete {selectedCardIds.length} Cards?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete these <strong className="text-slate-900">{selectedCardIds.length} selected QR service cards</strong>? All associated verification links will be revoked permanently.
              </p>
            </div>

            {/* List preview of selected cards being deleted */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-36 overflow-y-auto text-left text-xs space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Cards to be deleted:
              </span>
              {qrCards
                .filter((c) => selectedCardIds.includes(c.id))
                .map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-slate-700 font-mono text-[11px] py-0.5 border-b border-slate-100 last:border-0">
                    <span className="font-bold text-slate-900">{c.cardCode}</span>
                    <span className="text-slate-500 font-sans text-[10px] truncate max-w-[150px]">{c.assignedUserName || 'Unassigned'}</span>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={deletingBulk}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkDelete}
                disabled={deletingBulk}
                className="px-5 py-2.5 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-500 shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                {deletingBulk ? 'Deleting Cards...' : `Yes, Delete ${selectedCardIds.length} Cards`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: SCANNER / VERIFIER MODAL */}
      {showScanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scan className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-base">QR Scanner & Card Verifier</h3>
              </div>
              <button onClick={() => setShowScanModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-700">Simulate QR Scan (Paste payload or Card Code):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="e.g. CARD-2026-9281 or card verification URL"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-800"
                  />
                  <button
                    onClick={handleScanLookup}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Lookup
                  </button>
                </div>
              </div>

              {scanError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-red-600" />
                  {scanError}
                </div>
              )}

              {scannedResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-800 font-extrabold flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> PASS VERIFIED & VALID
                    </span>
                    <span className="font-mono font-bold text-xs text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-300">
                      {scannedResult.cardCode}
                    </span>
                  </div>

                  <div className="space-y-1 text-slate-700 text-xs bg-white p-3 rounded-xl border border-emerald-100">
                    <div className="font-bold text-slate-900">{scannedResult.cardTitle}</div>
                    <div>Contact: <strong>{scannedResult.savedContactName || (scannedResult.availments && scannedResult.availments[0]?.contactPersonName) || 'Customer / Card Holder'}</strong></div>
                    <div className="text-[11px] text-slate-500">Expires: {scannedResult.validUntil}</div>
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Services:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {scannedResult.services.map((svc, i) => (
                          <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        const newStatus: QrCardStatus = scannedResult.status === 'active' ? 'used' : 'active';
                        onUpdateStatus(scannedResult.id, newStatus);
                        setScannedResult({ ...scannedResult, status: newStatus });
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs"
                    >
                      Toggle Status ({scannedResult.status})
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Single Pass Visual Preview */}
      {previewCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto border border-slate-200 shadow-2xl p-6 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-400 font-mono uppercase">{previewCard.cardCode}</span>
              <button onClick={() => setPreviewCard(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">FACILITY SERVICE PASS</span>
              <h3 className="font-extrabold text-base text-white">{previewCard.cardTitle}</h3>
              <p className="text-xs text-slate-300 font-medium">Contact: {previewCard.savedContactName || (previewCard.availments && previewCard.availments[0]?.contactPersonName) || 'Customer / Card Holder'}</p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl inline-block mx-auto">
              <QrCodeCanvas value={previewCard.verificationUrl || previewCard.qrData} size={160} />
            </div>

            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100 text-left">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Valid Until</span>
                <span className="font-semibold text-slate-900">{previewCard.validUntil}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex flex-col gap-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Verification Link</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={previewCard.verificationUrl || previewCard.qrData}
                    className="min-w-0 w-full sm:flex-1 px-2.5 py-2 sm:py-1.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-700 select-all"
                  />
                  <button
                    onClick={() => handleCopyLink(previewCard)}
                    className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={previewCard.verificationUrl || previewCard.qrData}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-slate-800 text-white rounded hover:bg-slate-700 transition-colors"
                    title="Open verification page in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            <div className="text-left space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Entitled Services</span>
              <div className="flex flex-wrap gap-1">
                {previewCard.services.map((s, idx) => (
                  <span key={idx} className="text-[10px] font-semibold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-center">
              <button
                onClick={() => setPreviewCard(null)}
                className="w-full py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
              >
                Close Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Service Pass Printer */}
      {printModalCards && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight">Service Pass Printer</h3>
                  <p className="text-[11px] text-slate-400">
                    Ready to print {printModalCards.length} pass{printModalCards.length > 1 ? 'es' : ''} in ISO CR80 Pass size (85.6mm × 54mm) Front & Back.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print / Save as PDF
                </button>
                <button
                  onClick={() => setPrintModalCards(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body Preview */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-100">
              <div className="bg-blue-50/80 border border-blue-200/80 p-3.5 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Printable Service Passes:</strong> Each badge below is formatted to standard pass proportions (3.375" × 2.125" / 85.6mm × 54mm). Click <strong>"Print / Save as PDF"</strong> to send to your card printer or save as PDF.
                </p>
              </div>

              {/* Printable Container */}
              <div id="printable-credit-cards-sheet" className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200">
                <style>{`
                  @media print {
                    body * {
                      visibility: hidden !important;
                    }
                    #printable-credit-cards-sheet,
                    #printable-credit-cards-sheet * {
                      visibility: visible !important;
                    }
                    #printable-credit-cards-sheet {
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 100% !important;
                      margin: 0 !important;
                      padding: 10mm !important;
                      background: white !important;
                      box-shadow: none !important;
                      border: none !important;
                    }
                    .credit-card-pair-wrapper {
                      page-break-inside: avoid !important;
                      break-inside: avoid !important;
                      margin-bottom: 8mm !important;
                    }
                  }
                `}</style>

                {printModalCards.map((card) => (
                  <div key={card.id} className="credit-card-pair-wrapper border-b border-slate-200 pb-6 last:border-b-0 last:pb-0">
                    <div className="text-xs font-bold text-slate-400 mb-2 font-mono uppercase flex items-center justify-between">
                      <span>Card Code: {card.cardCode}</span>
                      <span>{(() => {
                        const assignedUser = managedUsers.find((user) => user.id === card.assignedUserId);
                        return assignedUser?.accountType === 'internal_staff'
                          ? 'Premier Lighting and Sign'
                          : assignedUser?.companyName || card.assignedUserName || 'Jobber';
                      })()}</span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
                      {/* FRONT OF CREDIT CARD */}
                      <div className="w-[85.6mm] h-[54mm] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white rounded-[10px] p-3.5 flex flex-col justify-between shadow-md border border-slate-800 relative overflow-hidden shrink-0">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <div className="flex items-center gap-1.5">
                            <QrCode className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[9px] font-extrabold tracking-widest text-blue-300 uppercase">SERVICE PASS</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-amber-500/30">
                            {card.cardCode}
                          </span>
                        </div>

                        <div className="my-1 space-y-0.5">
                          <h4 className="font-extrabold text-[11px] text-white tracking-tight line-clamp-1">{card.cardTitle}</h4>
                          <div className="text-[10px] font-semibold text-slate-300 line-clamp-1">
                            <span className="text-white font-bold">{(() => {
                              const assignedUser = managedUsers.find((user) => user.id === card.assignedUserId);
                              return assignedUser?.accountType === 'internal_staff'
                                ? 'Premier Lighting and Sign'
                                : assignedUser?.companyName || card.assignedUserName || 'Jobber';
                            })()}</span>
                          </div>
                          {(card.savedContactEmail || (card.availments && card.availments[0]?.contactEmail)) && (
                            <div className="text-[9px] text-slate-400 truncate">{card.savedContactEmail || card.availments?.[0]?.contactEmail}</div>
                          )}
                        </div>

                        <div className="pt-1 border-t border-slate-800/80 flex items-end justify-between">
                          <div className="max-w-[150px]">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">INCLUDED SERVICES</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {card.services.slice(0, 3).map((s, i) => (
                                <span key={i} className="text-[7.5px] font-bold bg-blue-900/60 text-blue-200 px-1 py-0.2 rounded border border-blue-700/50">
                                  {s}
                                </span>
                              ))}
                              {card.services.length > 3 && (
                                <span className="text-[7.5px] font-bold bg-slate-800 text-slate-300 px-1 py-0.2 rounded">+more</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-[8px] font-bold text-slate-400 uppercase block">VALID UNTIL</span>
                            <span className="text-[9.5px] font-extrabold text-amber-300 font-mono">{card.validUntil}</span>
                          </div>
                        </div>
                      </div>

                      {/* BACK OF CREDIT CARD */}
                      <div className="w-[85.6mm] h-[54mm] bg-white text-slate-900 rounded-[10px] p-3.5 flex flex-col justify-between shadow-md border border-slate-300 relative overflow-hidden shrink-0">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span className="text-[8.5px] font-extrabold tracking-widest text-slate-500 uppercase">AUTHENTICATION QR</span>
                          <span className="text-[8px] font-bold text-emerald-700 uppercase bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            {card.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 my-1">
                          <div className="p-1 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                            <QrCodeCanvas value={card.verificationUrl || card.qrData} size={85} />
                          </div>

                          <div className="flex-1 text-[8.5px] text-slate-600 space-y-1">
                            <div className="font-bold text-slate-900 uppercase">Official Service Pass</div>
                            <p className="text-[8px] text-slate-600 leading-snug">
                              Scan the QR code with any smartphone camera to view card status, included facility services, or log a service request.
                            </p>
                            <p className="text-[7.5px] text-slate-400 italic">
                              Public Card Lookup & Verification Portal
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-slate-200 pt-1 text-center text-[7.5px] text-slate-400 font-medium">
                          Property & Facility Management Service Access Pass • Official Credential
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                {printModalCards.length} Card{printModalCards.length > 1 ? 's' : ''} Ready to Print
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPrintModalCards(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

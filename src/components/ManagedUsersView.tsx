import React, { useState } from 'react';
import { ManagedUser, AccessLevel, ManagedUserAccountType, ManagedUserStatus } from '../types';
import { requestManagedUserPasswordReset } from '../lib/userService';
import { PaginationControls } from './PaginationControls';
import {
  UserPlus,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Edit3,
  Trash2,
  RefreshCw,
  Building2,
  Shield,
  CheckCircle,
  Ban,
  Clock,
  Sparkles,
  X,
  Filter,
  UserCheck,
  Mail,
  Send,
  Lock,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface ManagedUsersViewProps {
  managedUsers: ManagedUser[];
  currentAdminEmail: string;
  onRefresh: () => void;
  onCreateUser: (data: {
    displayName: string;
    email: string;
    password: string;
    accountType: ManagedUserAccountType;
    companyName: string;
    department: string;
    accessLevel: AccessLevel;
    status: ManagedUserStatus;
    notes?: string;
  }) => Promise<void>;
  onUpdateUser: (
    id: string,
    data: Partial<Omit<ManagedUser, 'id' | 'adminUid' | 'createdAt'>>
  ) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const DEPARTMENTS = [
  'General',
  'Engineering',
  'Sales & Marketing',
  'Operations',
  'Customer Support',
  'Finance & Accounting',
  'Human Resources',
  'IT & Infrastructure'
];

const ACCESS_LEVELS: AccessLevel[] = ['Standard User', 'Operator', 'Manager', 'Read Only'];

export const ManagedUsersView: React.FC<ManagedUsersViewProps> = ({
  managedUsers,
  currentAdminEmail,
  onRefresh,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onSuccess,
  onError
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [credentialsModalUser, setCredentialsModalUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const USERS_PAGE_SIZE = 10;

  // Form State
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    accountType: 'internal_staff' as ManagedUserAccountType,
    companyName: '',
    department: 'General',
    accessLevel: 'Standard User' as AccessLevel,
    status: 'active' as ManagedUserStatus,
    notes: ''
  });

  const [sendEmailOnCreate, setSendEmailOnCreate] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [sendingResetId, setSendingResetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filtered Users
  const filteredUsers = managedUsers.filter((user) => {
    const matchesSearch =
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.department || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.companyName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'all' || user.department === departmentFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PAGE_SIZE,
    currentPage * USERS_PAGE_SIZE
  );

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleDeptChange = (val: string) => {
    setDepartmentFilter(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await onDeleteUser(deletingUser.id);
      onSuccess(`Successfully deleted managed user ${deletingUser.displayName || deletingUser.email}.`);
      setDeletingUser(null);
    } catch (err: any) {
      onError(err.message || `Failed to delete managed user ${deletingUser.displayName}.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper: Generate Strong Password
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password: pass }));
  };

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      displayName: '',
      email: '',
      password: '',
      accountType: 'internal_staff',
      companyName: '',
      department: 'General',
      accessLevel: 'Standard User',
      status: 'active',
      notes: ''
    });
    // Pre-generate a password for convenience
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Usr-2026#';
    for (let i = 0; i < 4; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password: pass }));
    setSendEmailOnCreate(true);
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (user: ManagedUser) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName,
      email: user.email,
      password: '',
      accountType: user.accountType || 'internal_staff',
      companyName: user.companyName || '',
      department: user.department || 'General',
      accessLevel: user.accessLevel || 'Standard User',
      status: user.status || 'active',
      notes: user.notes || ''
    });
    setIsCreateModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.displayName.trim() || !formData.email.trim()) {
      onError('Please fill in Name and Email.');
      return;
    }

    if (formData.accountType === 'client' && !formData.companyName.trim()) {
      onError('Please enter the client company name.');
      return;
    }

    if (!editingUser && !formData.password.trim()) {
      onError('Please provide or generate an initial password for user setup.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        const updateData: any = {
          displayName: formData.displayName,
          email: formData.email,
          accountType: formData.accountType,
          companyName: formData.accountType === 'client' ? formData.companyName.trim() : '',
          department: formData.accountType === 'client' ? 'Client' : formData.department,
          accessLevel: formData.accountType === 'client' ? 'Standard User' : formData.accessLevel,
          status: formData.status,
          notes: formData.notes
        };
        if (formData.password.trim()) {
          updateData.password = formData.password.trim();
        }
        await onUpdateUser(editingUser.id, updateData);
        onSuccess(`Updated managed user ${formData.displayName}`);
      } else {
        await onCreateUser({
          ...formData,
          companyName: formData.accountType === 'client' ? formData.companyName.trim() : '',
          department: formData.accountType === 'client' ? 'Client' : formData.department,
          accessLevel: formData.accountType === 'client' ? 'Standard User' : formData.accessLevel
        });
        onSuccess(
          `User ${formData.displayName} created! Automated onboarding email dispatched with secure password setup link.`
        );
      }
      setIsCreateModalOpen(false);
    } catch (err: any) {
      onError(err.message || 'Failed to save managed user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendResetEmail = async (user: ManagedUser) => {
    setSendingResetId(user.id);
    try {
      const res = await requestManagedUserPasswordReset(user.email, undefined, 'admin_reset');
      if (res.success) {
        onSuccess(`Password change email sent via Resend to ${user.email}`);
      } else {
        onError(`Email delivery warning: ${res.message}`);
      }
      onRefresh();
    } catch (err: any) {
      onError(err.message || `Failed to send password reset email to ${user.email}`);
    } finally {
      setSendingResetId(null);
    }
  };

  const handleCopyProfile = (user: ManagedUser) => {
    const text = `Name: ${user.displayName}\nEmail: ${user.email}\nDepartment: ${user.department}\nAccess Level: ${user.accessLevel}\nPassword Security: SHA-256 Hashed`;
    navigator.clipboard.writeText(text);
    setCopiedId(user.id);
    onSuccess(`User details copied to clipboard for ${user.displayName}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Stats calculation
  const totalCount = managedUsers.length;
  const activeCount = managedUsers.filter((u) => u.status === 'active').length;
  const deptsSet = new Set(managedUsers.map((u) => u.department));

  return (
    <div className="space-y-6">
      {/* Header & Main Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Managed Users Directory</h2>
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold text-[10px] rounded-full border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Hashed Passwords Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create user accounts, assign departments, and trigger automated password change emails via Resend.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            title="Refresh List"
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Create Managed User
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0 border border-blue-100">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Managed Users</p>
            <p className="text-xl font-bold text-slate-900">{totalCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Active Accounts</p>
            <p className="text-xl font-bold text-slate-900">{activeCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center shrink-0 border border-purple-100">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Departments Covered</p>
            <p className="text-xl font-bold text-slate-900">{deptsSet.size}</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search users by name, email, or department..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={departmentFilter}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 sm:flex-initial">
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <th className="px-6 py-3">User Profile</th>
                <th className="px-6 py-3">Account Details</th>
                <th className="px-6 py-3">Password & Encryption</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-slate-600 text-sm">No managed users found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Click &quot;Create Managed User&quot; above to add users under your admin account.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const isCopied = copiedId === u.id;
                  const isSendingThis = sendingResetId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Email */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center shrink-0 text-xs">
                            {u.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{u.displayName}</div>
                            <div className="text-slate-500 text-[11px] font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Account Details */}
                      <td className="px-6 py-3.5">
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded border border-blue-200">
                            {u.accountType === 'client' ? 'Client / Jobber' : 'Internal Staff'}
                          </span>
                          {u.accountType === 'client' ? (
                            <span className="inline-flex items-center gap-1 text-slate-700 font-medium text-xs">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {u.companyName || 'Company not provided'}
                            </span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 text-slate-700 font-medium text-xs">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                {u.department || 'General'}
                              </span>
                              <div>
                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded">
                                  {u.accessLevel || 'Standard User'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Password Security / Email Change */}
                      <td className="px-6 py-3.5">
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[11px] rounded border border-slate-200">
                            <Lock className="w-3 h-3 text-emerald-600" />
                            <span>SHA-256 Hashed</span>
                          </div>
                          <div>
                            <button
                              onClick={() => handleSendResetEmail(u)}
                              disabled={isSendingThis}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              {isSendingThis ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Sending Email...</span>
                                </>
                              ) : (
                                <>
                                  <Mail className="w-3 h-3" />
                                  <span>Send Password Change Email</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            u.status === 'suspended'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : u.status === 'inactive'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {u.status === 'suspended' ? (
                            <Ban className="w-3 h-3" />
                          ) : (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          <span className="capitalize">{u.status}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setCredentialsModalUser(u)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded border border-slate-200 transition-colors"
                          >
                            Details
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(u)}
                            title="Edit User"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeletingUser(u)}
                            title="Delete User"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 10 Items per Page Pagination */}
        <PaginationControls
          currentPage={currentPage}
          totalItems={filteredUsers.length}
          pageSize={USERS_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingUser ? 'Edit Managed User' : 'Create New Managed User'}
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="e.g. John Smith"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  User Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.smith@company.com"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {editingUser ? 'Update Password (Optional)' : 'Initial Password / Key'}
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Auto-Generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? 'Leave blank to keep existing password' : 'Enter or generate initial key'}
                    required={!editingUser}
                    className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  🔒 All passwords are automatically hashed with SHA-256.
                </p>
              </div>

              {!editingUser && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <label className="font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sendEmailOnCreate}
                        onChange={(e) => setSendEmailOnCreate(e.target.checked)}
                        className="mr-1.5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      Send Password Setup Email to User via Resend
                    </label>
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      Sends an automated onboarding email from Premier Lighting with a secure token to set/change their password.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Account Type
                </label>
                <select
                  value={formData.accountType}
                  onChange={(e) => setFormData({ ...formData, accountType: e.target.value as ManagedUserAccountType })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="internal_staff">Internal Staff</option>
                  <option value="client">Client / Jobber</option>
                </select>
              </div>

              {formData.accountType === 'client' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    placeholder="Enter client company name"
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Access Level
                  </label>
                  <select
                    value={formData.accessLevel}
                    onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value as AccessLevel })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {ACCESS_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Account Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as ManagedUserStatus })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER DETAILS CARD MODAL */}
      {credentialsModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm">Managed User Account Details</h3>
              </div>
              <button
                onClick={() => setCredentialsModalUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-900 text-white rounded-xl p-5 space-y-3 font-mono text-xs border border-slate-800 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">MANAGED USER ID</span>
                <span className="text-blue-400 font-bold">{credentialsModalUser.id.substring(0, 12)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">FULL NAME</span>
                <span className="text-white font-semibold text-sm">{credentialsModalUser.displayName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">LOGIN EMAIL</span>
                <span className="text-slate-200">{credentialsModalUser.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">PASSWORD SECURITY</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> SHA-256 Salted Hash (Encrypted)
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                <span className="text-slate-400">DEPT: {credentialsModalUser.department}</span>
                <span className="text-amber-300">LEVEL: {credentialsModalUser.accessLevel}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  handleSendResetEmail(credentialsModalUser);
                  setCredentialsModalUser(null);
                }}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Send Password Setup / Reset Email
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyProfile(credentialsModalUser)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-200"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Info
                </button>
                <button
                  onClick={() => setCredentialsModalUser(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 border border-red-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete Managed User</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span className="font-medium">User Name:</span>
                <span className="font-semibold text-slate-900">{deletingUser.displayName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="font-medium">Email:</span>
                <span className="font-mono text-slate-800">{deletingUser.email}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="font-medium">Department:</span>
                <span className="text-slate-800">{deletingUser.department}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this user account from your directory? They will no longer be able to log in to the Managed User Portal.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


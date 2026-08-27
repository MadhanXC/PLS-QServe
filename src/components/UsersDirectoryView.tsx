import React, { useState } from 'react';
import { AdminUserProfile } from '../types';
import { PaginationControls } from './PaginationControls';
import { Search, UserPlus, Shield, CheckCircle, Ban, Trash2, RefreshCw, AlertTriangle, X } from 'lucide-react';

interface UsersDirectoryViewProps {
  users: AdminUserProfile[];
  currentUserId: string;
  onRefresh: () => void;
  onUpdateStatus: (uid: string, status: 'active' | 'suspended') => void;
  onDeleteUser: (uid: string) => void;
  onAddUserClick: () => void;
}

const ADMINS_PAGE_SIZE = 10;

export const UsersDirectoryView: React.FC<UsersDirectoryViewProps> = ({
  users,
  currentUserId,
  onRefresh,
  onUpdateStatus,
  onDeleteUser,
  onAddUserClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [deletingAdminUser, setDeletingAdminUser] = useState<AdminUserProfile | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const filteredUsers = users.filter((u) => {
    return (
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * ADMINS_PAGE_SIZE,
    currentPage * ADMINS_PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Admin Directory</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage administrative user accounts and access statuses
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            title="Refresh Directory"
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onAddUserClick}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Register Admin
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative flex-1 w-full">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search admins by name or email..."
          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Admin Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="px-6 py-3">Admin Profile</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Registered</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No admin users found matching your search.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const isCurrent = u.uid === currentUserId;
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Email */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 text-white font-bold rounded-lg flex items-center justify-center shrink-0 text-xs">
                            {u.displayName ? u.displayName.charAt(0).toUpperCase() : u.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{u.displayName || 'Unnamed Admin'}</span>
                              {isCurrent && (
                                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-slate-500 text-[11px] block">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            u.status === 'suspended'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {u.status === 'suspended' ? (
                            <>
                              <Ban className="w-3 h-3" /> Suspended
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3" /> Active
                            </>
                          )}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="px-6 py-3.5 text-slate-500 text-[11px]">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3.5 text-right">
                        {!isCurrent && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() =>
                                onUpdateStatus(u.uid, u.status === 'suspended' ? 'active' : 'suspended')
                              }
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                                u.status === 'suspended'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                              }`}
                              title={u.status === 'suspended' ? 'Activate User' : 'Suspend User'}
                            >
                              {u.status === 'suspended' ? 'Activate' : 'Suspend'}
                            </button>

                            <button
                              onClick={() => setDeletingAdminUser(u)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
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
          pageSize={ADMINS_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* DELETE ADMIN CONFIRMATION MODAL */}
      {deletingAdminUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 bg-red-50 text-red-600 rounded-lg flex items-center justify-center shrink-0 border border-red-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete Admin Account</h3>
                <p className="text-xs text-slate-500">Remove administrator record</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span className="font-medium">Admin Name:</span>
                <span className="font-semibold text-slate-900">{deletingAdminUser.displayName || 'Unnamed'}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="font-medium">Email:</span>
                <span className="font-mono text-slate-800">{deletingAdminUser.email}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove this administrator record? This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingAdminUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteUser(deletingAdminUser.uid);
                  setDeletingAdminUser(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Admin</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

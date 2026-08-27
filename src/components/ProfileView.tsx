import React, { useState } from 'react';
import { User, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { AdminUserProfile } from '../types';
import { updateUserRole, syncUserProfile } from '../lib/userService';
import { User as UserIcon, Mail, Shield, KeyRound, CheckCircle, AlertTriangle, Save, LogOut } from 'lucide-react';

interface ProfileViewProps {
  authUser: User;
  profile: AdminUserProfile | null;
  onRefreshProfile: () => void;
  onLogout: () => void;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  authUser,
  profile,
  onRefreshProfile,
  onLogout,
  onSuccessMessage,
  onErrorMessage
}) => {
  const [displayName, setDisplayName] = useState(
    profile?.displayName || authUser.displayName || authUser.email?.split('@')[0] || ''
  );
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      onErrorMessage('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      }
      await syncUserProfile(authUser.uid, authUser.email || '', displayName.trim(), profile?.role || 'admin');
      onSuccessMessage('Profile updated successfully!');
      onRefreshProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      onErrorMessage(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    setVerifying(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        onSuccessMessage(`Verification email sent to ${authUser.email}. Please check your inbox.`);
      }
    } catch (err: any) {
      console.error('Email verification error:', err);
      onErrorMessage(err.message || 'Failed to send verification email.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Profile Overview Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-6 border-b border-slate-200 pb-6 mb-6">
          <div className="w-16 h-16 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center text-2xl shadow-xs">
            {displayName ? displayName.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-bold text-slate-900">{displayName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{authUser.email}</p>
            <div className="flex items-center justify-center sm:justify-start gap-2 mt-2.5">
              <span className="px-2.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200/80 rounded text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {profile?.role ? profile.role.replace('_', ' ') : 'Admin'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                  authUser.emailVerified ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {authUser.emailVerified ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Verified
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3" /> Unverified
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Email Verification Banner if unverified */}
        {!authUser.emailVerified && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-900">Your email address is not verified yet</p>
              <p className="text-xs text-amber-700 mt-0.5">Verify your email to ensure uninterrupted administrative access.</p>
            </div>
            <button
              onClick={handleSendVerificationEmail}
              disabled={verifying}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold shadow-xs transition-colors shrink-0 disabled:opacity-50"
            >
              {verifying ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Account Information
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Display Name
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={authUser.email || ''}
                disabled
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-sm cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Managed via Account Authentication.</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </form>
      </div>

      {/* Account Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Sign Out</h3>
          <p className="text-xs text-slate-500">End your current administrative session safely</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out of Portal
        </button>
      </div>
    </div>
  );
};

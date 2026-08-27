import React, { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { requestManagedUserPasswordReset } from '../lib/userService';
import { Mail, KeyRound, ArrowLeft, ShieldCheck, UserCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface ForgotPasswordModalProps {
  onBackToLogin: () => void;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
  initialAccountType?: 'admin' | 'managed_user';
  initialEmail?: string;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  onBackToLogin,
  onSuccessMessage,
  onErrorMessage,
  initialAccountType = 'managed_user',
  initialEmail = ''
}) => {
  const [accountType, setAccountType] = useState<'admin' | 'managed_user'>(initialAccountType);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setLocalErrorMessage] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      const msg = 'Please enter your email address.';
      setLocalErrorMessage(msg);
      onErrorMessage(msg);
      return;
    }

    setLoading(true);
    try {
      if (accountType === 'admin') {
        try {
          await sendPasswordResetEmail(auth, cleanEmail);
          setSubmitted(true);
          const successMsg = `Admin password reset link sent to ${cleanEmail}. Please check your inbox.`;
          setStatusMessage(successMsg);
          onSuccessMessage(successMsg);
        } catch (adminErr: any) {
          // If not found in Firebase Auth, check if they exist as a managed user
          try {
            await requestManagedUserPasswordReset(cleanEmail);
            setAccountType('managed_user');
            setSubmitted(true);
            const successMsg = `Password reset link sent to ${cleanEmail}. Please check your inbox.`;
            setStatusMessage(successMsg);
            onSuccessMessage(successMsg);
          } catch {
            throw adminErr;
          }
        }
      } else {
        // Managed user reset: checks Firestore DB for email existence
        const res = await requestManagedUserPasswordReset(cleanEmail);
        setSubmitted(true);
        const successMsg = res.message || `Password reset link sent to ${cleanEmail}. Please check your inbox.`;
        setStatusMessage(successMsg);
        onSuccessMessage(successMsg);
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      let errorMsg = 'Failed to send password reset email.';
      if (err.code === 'auth/user-not-found') {
        errorMsg = `No administrator account found with email "${cleanEmail}".`;
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address format.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      setLocalErrorMessage(errorMsg);
      onErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200 p-8 sm:p-10">
      <div className="text-center mb-6">
        <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-xs">
          <KeyRound className="w-6 h-6" />
        </div>
        <div className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider mb-1">
          PLS QServe • Prototype v0.1.0
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Forgot Password</h2>
        <p className="text-sm text-slate-500 mt-1">
          {accountType === 'managed_user'
            ? 'Enter your registered email to receive a password setup link'
            : 'Receive a secure reset link to update your admin credentials'}
        </p>
      </div>

      {/* Account Type Selector */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setAccountType('managed_user');
            setSubmitted(false);
            setLocalErrorMessage(null);
          }}
          className={`py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1.5 ${
            accountType === 'managed_user'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Managed User</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setAccountType('admin');
            setSubmitted(false);
            setLocalErrorMessage(null);
          }}
          className={`py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1.5 ${
            accountType === 'admin'
              ? 'bg-white text-slate-900 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>Admin Account</span>
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block">Password Reset Error</strong>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center mb-6 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <p className="text-sm text-emerald-900 font-bold">Check your email inbox!</p>
          <p className="text-xs text-emerald-700 leading-relaxed">
            {statusMessage || `We sent a secure password setup link to ${email}. The link is valid for 48 hours.`}
          </p>
          <div className="pt-2 text-[11px] text-emerald-600 italic">
            Click the link in the email to set your new password.
          </div>
        </div>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {accountType === 'managed_user' ? 'Managed User Email Address' : 'Admin Email Address'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLocalErrorMessage(null);
                }}
                placeholder={accountType === 'managed_user' ? 'user@premierlighting.site' : 'admin@premierlighting.site'}
                required
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {accountType === 'managed_user'
                ? 'We will verify your email in the user database and email you a direct password setup link.'
                : 'We will send a Firebase password recovery link to your admin email address.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              'Send Password Reset Link'
            )}
          </button>
        </form>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200 text-center">
        <button
          type="button"
          onClick={onBackToLogin}
          className="font-semibold text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Sign In
        </button>
      </div>
    </div>
  );
};

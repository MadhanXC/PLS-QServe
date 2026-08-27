import React, { useState, useEffect } from 'react';
import { getManagedUserByResetToken, resetManagedUserPasswordWithToken, requestManagedUserPasswordReset } from '../lib/userService';
import { ManagedUser } from '../types';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, RefreshCw, KeyRound, Mail } from 'lucide-react';

interface SetPasswordViewProps {
  token: string;
  emailHint?: string;
  onSuccess: (user: ManagedUser) => void;
  onCancel: () => void;
}

export const SetPasswordView: React.FC<SetPasswordViewProps> = ({
  token,
  emailHint,
  onSuccess,
  onCancel
}) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ManagedUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Re-request link state if token is expired
  const [requestNewEmail, setRequestNewEmail] = useState(emailHint || '');
  const [requestingNew, setRequestingNew] = useState(false);
  const [newLinkSent, setNewLinkSent] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function verifyToken() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const u = await getManagedUserByResetToken(token);
        if (isMounted) {
          setUser(u);
          if (!requestNewEmail && u.email) {
            setRequestNewEmail(u.email);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'The password reset link is invalid or expired.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const updatedUser = await resetManagedUserPasswordWithToken(token, newPassword);
      setUser(updatedUser);
      setCompleted(true);
    } catch (err: any) {
      console.error('Password reset submit error:', err);
      setErrorMessage(err.message || 'Failed to update password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestNewEmail.trim()) {
      setErrorMessage('Please enter your email address to receive a new link.');
      return;
    }

    setRequestingNew(true);
    setErrorMessage(null);
    try {
      await requestManagedUserPasswordReset(requestNewEmail.trim());
      setNewLinkSent(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send new password reset email.');
    } finally {
      setRequestingNew(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center mx-auto mb-3 backdrop-blur-xs border border-white/20">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Premier Lighting Portal</h1>
          <p className="text-xs text-blue-200 mt-1">Managed Account Password Setup & Encryption</p>
        </div>

        <div className="p-6 sm:p-8">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Verifying secure password setup token...</p>
              <p className="text-xs text-slate-400">Please wait a moment.</p>
            </div>
          ) : completed && user ? (
            <div className="text-center py-4 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Password Set Successfully!</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Your new credentials have been securely hashed and encrypted in the directory.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">User:</span>
                  <span className="text-slate-800 font-bold">{user.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Login Email:</span>
                  <span className="text-slate-800 font-mono font-bold">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-semibold">Security:</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> SHA-256 Hashed
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSuccess(user)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                <span>Enter User Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : errorMessage ? (
            <div className="space-y-5">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold text-rose-900 block">Link Invalid or Expired</strong>
                  <p>{errorMessage}</p>
                </div>
              </div>

              {newLinkSent ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-emerald-900">New Password Link Sent!</p>
                  <p className="text-xs text-emerald-700">
                    Check your email inbox at <strong>{requestNewEmail}</strong> for a fresh link.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleRequestNewLink} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Request a New Password Setup Link
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={requestNewEmail}
                        onChange={(e) => setRequestNewEmail(e.target.value)}
                        placeholder="user@premierlighting.site"
                        required
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={requestingNew}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {requestingNew ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Send Fresh Password Setup Link'
                    )}
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : user ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-xs text-blue-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-blue-950">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> Account Identity Confirmed
                </p>
                <p className="text-blue-800">
                  Setting password for <strong>{user.displayName}</strong> ({user.email}) in department <strong>{user.department}</strong>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 6 characters"
                    required
                    minLength={6}
                    autoFocus
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type your new password"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Password Rules / Security badge */}
              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Enterprise Cryptographic Security
                </div>
                <p>
                  Your password is immediately hashed with a unique cryptographic salt (SHA-256) before storage. It is never stored in plain text.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                {submitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    Save Hashed Password & Sign In
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel and Return to Sign In
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};

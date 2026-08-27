import React, { useState } from 'react';
import { safeSignInWithEmailAndPassword } from '../lib/firebase';
import { AuthMode } from '../types';
import { Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, UserCheck, QrCode, Sparkles } from 'lucide-react';

interface LoginFormProps {
  onSwitchMode: (mode: AuthMode, accountType?: 'admin' | 'managed_user', email?: string) => void;
  onManagedUserLogin: (email: string, pass: string) => Promise<void>;
  onVerifyCard?: (cardId: string) => void;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSwitchMode,
  onManagedUserLogin,
  onVerifyCard,
  onSuccessMessage,
  onErrorMessage
}) => {
  const [loginType, setLoginType] = useState<'admin' | 'user' | 'card'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Quick Card Lookup State
  const [cardNumberInput, setCardNumberInput] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loginType === 'card') {
      if (!cardNumberInput.trim()) {
        onErrorMessage('Please enter a valid Card Number or Card Code.');
        return;
      }
      if (onVerifyCard) {
        onVerifyCard(cardNumberInput.trim());
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      onErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (loginType === 'admin') {
        try {
          await safeSignInWithEmailAndPassword(email.trim(), password);
          onSuccessMessage('Welcome back! Admin login successful.');
          return;
        } catch (adminErr: any) {
          // Fallback: try authenticating as managed user in case user selected Admin tab by mistake
          try {
            await onManagedUserLogin(email.trim(), password);
            onSuccessMessage('User portal access granted.');
            return;
          } catch (userErr) {
            // Re-throw original admin error
            throw adminErr;
          }
        }
      } else {
        try {
          await onManagedUserLogin(email.trim(), password);
          onSuccessMessage('User portal access granted.');
        } catch (userErr: any) {
          // Fallback: check if user is actually an administrator who selected the User tab
          try {
            await safeSignInWithEmailAndPassword(email.trim(), password);
            onSuccessMessage('Welcome back! Admin login successful.');
            return;
          } catch {
            throw userErr;
          }
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMsg = 'Failed to sign in. Please check your credentials.';
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        errorMsg = 'Invalid email or password. Please check your credentials or register a new admin account.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed login attempts. Please try again later.';
      } else if (err.message && err.message.includes('Account not found in managed users directory')) {
        errorMsg = `No managed user account found for "${email.trim()}". Please verify your email with your Administrator or use the Admin tab.`;
      } else if (
        err.message &&
        (err.message.includes('Database is closing') ||
          err.message.includes('Database is hidden') ||
          err.message.includes('IndexedDB'))
      ) {
        errorMsg = 'Browser database connection re-established. Please try signing in again.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      onErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md flex flex-col items-center">
      <div className="w-full bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200 p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-xs">
            {loginType === 'admin' ? (
              <ShieldCheck className="w-6 h-6" />
            ) : loginType === 'user' ? (
              <UserCheck className="w-6 h-6" />
            ) : (
              <QrCode className="w-6 h-6" />
            )}
          </div>
          <div className="text-[10px] font-extrabold text-amber-600 uppercase tracking-wider mb-1">
            PLS QServe • Prototype v0.1.0
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            {loginType === 'admin'
              ? 'Admin Portal Sign In'
              : loginType === 'user'
              ? 'Client Portal Sign In'
              : 'Avail Pass Services'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {loginType === 'admin'
              ? 'Sign in to access management controls'
              : loginType === 'user'
              ? 'Enter credentials assigned by your Admin'
              : 'Enter your Card Number to view pass & avail services'}
          </p>
        </div>

        {/* Role & Access Selection Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mb-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLoginType('admin')}
            className={`py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1 ${
              loginType === 'admin'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Admin</span>
          </button>
          <button
            type="button"
            onClick={() => setLoginType('user')}
            className={`py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1 ${
              loginType === 'user'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>User</span>
          </button>
          <button
            type="button"
            onClick={() => setLoginType('card')}
            className={`py-2 px-1 rounded-md transition-all flex items-center justify-center gap-1 ${
              loginType === 'card'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:text-emerald-900 font-bold'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>Card Lookup</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {loginType === 'card' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Card Number / Pass Code
              </label>
              <div className="relative">
                <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cardNumberInput}
                  onChange={(e) => setCardNumberInput(e.target.value)}
                  placeholder="e.g. CARD-8F3A2 or Pass ID"
                  required
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm font-mono font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2 italic">
                💡 Enter the unique Card Number printed on your physical/digital QR card pass to instantly check card details and request service availments.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={loginType === 'admin' ? 'admin@enterprise.io' : 'user@company.com'}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {loginType === 'admin' ? 'Admin Password' : 'User Password'}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      onSwitchMode(
                        'forgot-password',
                        loginType === 'user' ? 'managed_user' : 'admin',
                        email.trim()
                      )
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-1"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
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
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed ${
              loginType === 'card'
                ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
            }`}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : loginType === 'card' ? (
              <>
                <Sparkles className="w-4 h-4" />
                Access Pass & Avail Services
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                {loginType === 'admin' ? 'Sign In as Admin' : 'Sign In as Managed User'}
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        {loginType === 'admin' && (
          <>
            <div className="my-6 flex items-center text-slate-400 text-xs font-medium">
              <div className="flex-1 border-b border-slate-200"></div>
              <span className="px-3 uppercase tracking-wider text-[11px]">OR</span>
              <div className="flex-1 border-b border-slate-200"></div>
            </div>

            {/* Switch to Register */}
            <button
              type="button"
              onClick={() => onSwitchMode('register')}
              className="w-full py-2.5 px-4 bg-transparent border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-1.5"
            >
              Register New Admin
            </button>
          </>
        )}
      </div>
    </div>
  );
};



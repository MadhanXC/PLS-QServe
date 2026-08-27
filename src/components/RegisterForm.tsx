import React, { useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { safeCreateUserWithEmailAndPassword } from '../lib/firebase';
import { syncUserProfile } from '../lib/userService';
import { AuthMode } from '../types';
import { User, Mail, Lock, Eye, EyeOff, UserPlus, ArrowLeft, KeyRound } from 'lucide-react';

interface RegisterFormProps {
  onSwitchMode: (mode: AuthMode) => void;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSwitchMode,
  onSuccessMessage,
  onErrorMessage
}) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim() || !email.trim() || !accessCode.trim() || !password || !confirmPassword) {
      onErrorMessage('Please complete all required fields.');
      return;
    }

    const requiredCode = import.meta.env.VITE_ADMIN_REGISTRATION_CODE;
    if (accessCode.trim() !== requiredCode) {
      onErrorMessage('Invalid Admin Registration Code. Please enter the correct access code.');
      return;
    }

    if (password !== confirmPassword) {
      onErrorMessage('Passwords do not match. Please verify your password.');
      return;
    }

    if (password.length < 6) {
      onErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await safeCreateUserWithEmailAndPassword(email.trim(), password);
      const user = userCredential.user;

      // Update Firebase Auth display name
      await updateProfile(user, { displayName: displayName.trim() });

      // Save user record in Firestore with role 'admin'
      await syncUserProfile(user.uid, user.email || email.trim(), displayName.trim(), 'admin');

      onSuccessMessage('Admin account registered successfully!');
    } catch (err: any) {
      console.error('Registration error:', err);
      let errorMsg = 'Failed to register admin account.';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'This email address is already registered. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'The password is too weak. Please use a stronger password.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      onErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200 p-8 sm:p-10">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-xs">
          <UserPlus className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Register Admin</h2>
        <p className="text-sm text-slate-500 mt-1">Create a new administrative account</p>
      </div>

      {/* Form */}
      <form onSubmit={handleRegister} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Full Name
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
              required
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Admin Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@enterprise.io"
              required
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Registration Code
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Enter admin registration code"
              required
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              minLength={6}
              className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
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
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              minLength={6}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 mt-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Register Account
            </>
          )}
        </button>
      </form>

      {/* Switch to Login */}
      <div className="mt-6 pt-4 border-t border-slate-200 text-center">
        <p className="text-xs text-slate-500">
          Already registered?{' '}
          <button
            type="button"
            onClick={() => onSwitchMode('login')}
            className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 ml-1"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

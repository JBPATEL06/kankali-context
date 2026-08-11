import React, { useState } from 'react';
import { Hexagon } from 'lucide-react';

interface LoginGateProps {
  onLogin: () => void;
  onEmailLogin: (email: string, pass: string) => void;
  onEmailSignUp?: (email: string, pass: string, name: string) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onLogin, onEmailLogin, onEmailSignUp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isSignUp && onEmailSignUp) {
        await onEmailSignUp(email, password, email.split('@')[0]);
      } else {
        await onEmailLogin(email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
        setError('This app domain is not authorized for OAuth. Please add it to your Firebase Console -> Authentication -> Settings -> Authorized Domains.');
      } else {
        setError(err.message || (isSignUp ? 'Sign up failed' : 'Login failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      await onLogin();
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain')) {
        setError('Google Sign-In Error: This app domain is not authorized. Please add it to your Firebase Console -> Authentication -> Settings -> Authorized domains.');
      } else {
        setError(err.message || 'Google Sign-In failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full px-4">
      <div className="bg-white rounded-xl shadow-sm w-full max-w-[440px] p-10 flex flex-col items-center">
        {/* Logo */}
        <div className="flex items-center gap-1.5 mb-8">
          <Hexagon className="w-5 h-5 text-blue-600 fill-blue-600/20" />
          <span className="text-[13px] font-bold text-blue-700 tracking-tight">Nexia AI</span>
        </div>

        <h1 className="text-3xl font-semibold text-slate-900 mb-2 font-sans tracking-tight">Welcome back</h1>
        <p className="text-[15px] text-slate-600 mb-8 font-sans">Sign in to your professional workspace</p>

        {/* OAuth Buttons */}
        <div className="w-full space-y-4 mb-8">
          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-full border border-slate-300 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.67 15.63 16.86 16.79 15.69 17.57V20.34H19.26C21.34 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4"/>
              <path d="M12 23C14.97 23 17.46 22.02 19.26 20.34L15.69 17.57C14.71 18.23 13.47 18.63 12 18.63C9.15 18.63 6.74 16.71 5.88 14.13H2.21V16.98C4.01 20.55 7.69 23 12 23Z" fill="#34A853"/>
              <path d="M5.88 14.13C5.66 13.47 5.53 12.75 5.53 12C5.53 11.25 5.66 10.53 5.88 9.87V7.02H2.21C1.48 8.49 1.07 10.19 1.07 12C1.07 13.81 1.48 15.51 2.21 16.98L5.88 14.13Z" fill="#FBBC05"/>
              <path d="M12 5.38C13.62 5.38 15.06 5.93 16.2 7.02L19.33 3.89C17.45 2.14 14.97 1 12 1C7.69 1 4.01 3.45 2.21 7.02L5.88 9.87C6.74 7.29 9.15 5.38 12 5.38Z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center w-full mb-8">
          <div className="flex-1 h-px bg-slate-200"></div>
          <span className="px-4 text-xs font-medium text-slate-500">or sign in with email</span>
          <div className="flex-1 h-px bg-slate-200"></div>
        </div>

        {/* Form Content */}
        <div className="w-full">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end pb-2">
              <button type="button" className="text-xs font-medium text-blue-700 hover:text-blue-800">
                Forgot password?
              </button>
            </div>

            {error && (
              <div className="p-3 text-xs rounded-lg bg-red-50 border border-red-100 text-red-600 font-medium text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-[#003B95] text-white text-sm font-semibold hover:bg-blue-800 transition-colors shadow-sm cursor-pointer disabled:opacity-70 mt-4"
            >
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="font-semibold text-blue-700 hover:text-blue-800"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500 font-medium">
        <a href="#" className="hover:text-slate-700">Terms of Service</a>
        <a href="#" className="hover:text-slate-700">Privacy Policy</a>
      </div>
    </div>
  );
};

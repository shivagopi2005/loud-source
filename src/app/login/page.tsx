'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, Headphones, ArrowRight, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false); // Default: show Login page first
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const slides = [
    {
      title: 'Capturing Voices, Powering Fleets',
      subtitle: 'High-Fidelity Multi-Bot Discord Voice Studio',
    },
    {
      title: 'Synchronized Playback Across 25+ Bots',
      subtitle: '384 kbps Opus Audio with 10,000% Overdrive',
    },
    {
      title: '24/7 Channel Stay & Fleet Operations',
      subtitle: 'Zero Dropouts, Real-Time Low-Latency Sound',
    },
  ];

  // Rotate hero slides every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  // Capture URL error query parameters (e.g., from Discord OAuth redirect)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err) {
        if (err === 'OAUTH_STATE_MISMATCH') {
          setErrorMsg('Security validation failed (OAuth state mismatch). Please try again.');
        } else if (err === 'DISCORD_TOKEN_EXCHANGE_FAILED') {
          setErrorMsg('Discord authentication failed. Check your DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env.');
        } else if (err === 'DISCORD_USER_FETCH_FAILED') {
          setErrorMsg('Failed to retrieve your Discord profile. Please check network connectivity.');
        } else {
          setErrorMsg(`Authentication error: ${err}`);
        }
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    // If local/dev, attempt instant dev-login
    try {
      const res = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
    } catch {}

    // In production or if credentials provided, route securely through Discord OAuth
    window.location.href = '/api/auth/discord';
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-10 bg-[#0d0c14] font-sans text-slate-100 selection:bg-[#6355a4] selection:text-white">
      {/* Outer Card Container */}
      <div className="w-full max-w-4xl bg-[#1c1a26] border border-[#2d2a3d] rounded-[28px] shadow-2xl p-4 sm:p-5 md:p-6 flex flex-col md:flex-row gap-6 relative overflow-hidden backdrop-blur-xl">
        
        {/* Left Hero Artwork Panel */}
        <div
          className="w-full md:w-[46%] rounded-[22px] relative overflow-hidden flex flex-col justify-between p-6 sm:p-7 min-h-[440px] md:min-h-[560px] shadow-inner border border-white/5 bg-cover bg-center"
          style={{ backgroundImage: "url('/login-bg-clean.png')" }}
        >
          {/* Subtle gradient vignette over the artwork */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#161324]/95 via-black/20 to-[#161324]/40 pointer-events-none" />

          {/* Top Header: Brand Logo & Back Link */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-widest text-white drop-shadow-md">
                ɅMU
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10 backdrop-blur-sm">
                Loud
              </span>
            </div>

            <Link
              href="/"
              className="px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md text-white text-xs font-medium transition flex items-center gap-1.5 shadow-sm border border-white/10"
            >
              <span>Back to website</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Bottom Hero Text & Carousel Indicator */}
          <div className="relative z-10 space-y-4">
            <div className="space-y-1.5 transition-all duration-500">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight drop-shadow-lg">
                {slides[carouselIndex].title}
              </h2>
              <p className="text-xs sm:text-sm text-white/70 font-normal drop-shadow">
                {slides[carouselIndex].subtitle}
              </p>
            </div>

            {/* Carousel Pill Dots */}
            <div className="flex items-center gap-2 pt-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCarouselIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    carouselIndex === idx
                      ? 'w-7 bg-white shadow-sm'
                      : 'w-4 bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Authentication Form Panel */}
        <div className="w-full md:w-[54%] p-3 sm:p-5 md:p-8 flex flex-col justify-center space-y-6">
          {/* Header Title & Switch */}
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h1>
            <p className="text-xs sm:text-sm text-[#8c88a6]">
              {isSignUp ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="text-white underline font-semibold hover:text-[#9e8fe6] transition"
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  Need an account?{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className="text-white underline font-semibold hover:text-[#9e8fe6] transition"
                  >
                    Register
                  </button>
                  {' or sign in with Discord below'}
                </>
              )}
            </p>
          </div>

          {/* Error Alert Display */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-[#242232] border border-[#353249] focus:border-[#7c66dc] focus:ring-1 focus:ring-[#7c66dc] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#6a6680] outline-none transition"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-[#242232] border border-[#353249] focus:border-[#7c66dc] focus:ring-1 focus:ring-[#7c66dc] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#6a6680] outline-none transition"
                />
              </div>
            )}

            <div>
              <input
                type="text"
                required
                placeholder={isSignUp ? 'Email address' : 'Email or Username'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[#242232] border border-[#353249] focus:border-[#7c66dc] focus:ring-1 focus:ring-[#7c66dc] rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-[#6a6680] outline-none transition"
              />
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#242232] border border-[#353249] focus:border-[#7c66dc] focus:ring-1 focus:ring-[#7c66dc] rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-[#6a6680] outline-none transition pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#797593] hover:text-white transition p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Checkbox Row */}
            <div className="flex items-center justify-between text-xs text-[#8c88a6]">
              {isSignUp ? (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="w-4 h-4 rounded border-[#353249] bg-[#242232] text-[#6355a4] focus:ring-0 cursor-pointer accent-[#6355a4]"
                  />
                  <span>
                    I agree to the{' '}
                    <span className="text-white underline hover:text-[#9e8fe6]">
                      Terms &amp; Conditions
                    </span>
                  </span>
                </label>
              ) : (
                <>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-[#353249] bg-[#242232] text-[#6355a4] focus:ring-0 cursor-pointer accent-[#6355a4]"
                    />
                    <span>Remember me</span>
                  </label>
                  <a
                    href="https://discord.gg/XA4VZMYsbP"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#9e8fe6] hover:text-white transition hover:underline"
                  >
                    Need help?
                  </a>
                </>
              )}
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#6355a4] hover:bg-[#534691] active:scale-[0.99] text-white font-medium text-sm transition shadow-lg shadow-[#6355a4]/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>{isSignUp ? 'Create account' : 'Log in'}</span>
              )}
            </button>
          </form>

          {/* Social Divider */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2e2c40]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#1c1a26] px-3 text-[#6a6680] font-medium tracking-wide">
                {isSignUp ? 'Or register with' : 'Or continue with'}
              </span>
            </div>
          </div>

          {/* Social Action Buttons: Discord (replaces Google) & Support Server (replaces Apple) */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Discord OAuth Button (in place of Google) */}
            <a
              href="/api/auth/discord"
              className="flex items-center justify-center gap-2.5 py-3 px-3.5 rounded-xl border border-[#353249] bg-[#242232] hover:bg-[#2e2b3f] hover:border-[#5865F2]/60 text-white text-xs sm:text-sm font-medium transition cursor-pointer active:scale-[0.98] group"
              title="Authenticate with Discord OAuth2"
            >
              <svg
                className="w-4 h-4 fill-[#5865F2] group-hover:scale-110 transition-transform shrink-0"
                viewBox="0 0 24 24"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              <span>Discord</span>
            </a>

            {/* Support Server Discord Link (in place of Apple) */}
            <a
              href="https://discord.gg/XA4VZMYsbP"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl border border-[#353249] bg-[#242232] hover:bg-[#2e2b3f] hover:border-[#5865F2]/60 text-white text-xs sm:text-sm font-medium transition cursor-pointer active:scale-[0.98] group"
              title="Join our official Discord Support Server"
            >
              <Headphones className="w-4 h-4 text-[#9e8fe6] group-hover:scale-110 transition-transform shrink-0" />
              <span>Support Server</span>
            </a>
          </div>

          {/* Security footnote */}
          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-[#6a6680]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Encrypted with AES-256-GCM • Official Discord Verified Bot Fleet</span>
          </div>
        </div>
      </div>
    </div>
  );
}

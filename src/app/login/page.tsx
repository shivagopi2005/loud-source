'use client';

import React, { useEffect, useState } from 'react';
import { Radio, ShieldCheck, Mic, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mx-auto">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">
            LOUD VOICE STUDIO
          </h1>
          <p className="text-xs text-muted-foreground">
            Multi-Bot Discord Control Center &amp; Live Audio Operations
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3 pt-2">
          {/* Discord OAuth2 Authentication Button */}
          <a
            href="/api/auth/discord"
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold text-xs shadow-lg shadow-[#5865F2]/20 transition active:scale-[0.99]"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span>Continue with Discord</span>
          </a>
        </div>

        {/* Security badges */}
        <div className="pt-4 border-t border-border space-y-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Credentials encrypted at rest with AES-256-GCM.</span>
          </div>
          <div className="flex items-center gap-2">
            <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Studio Voice Engine: 48kHz SoX 28-bit • 384 kbps Opus.</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Official Discord bot accounts only. Strictly zero self-bots.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

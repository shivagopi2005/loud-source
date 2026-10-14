'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bot,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Power,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Copy,
  Check,
  Server,
  Activity,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function BotDetailPage() {
  const params = useParams();
  const router = useRouter();
  const botId = params.botId as string;
  const { currentWorkspace } = useWorkspace();

  const [bot, setBot] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Rotate token modal state
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  const loadBot = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/bots/${botId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setBot(json.data);
      }
    } catch (err) {
      console.error('Failed to load bot detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (botId) loadBot();
  }, [botId]);

  const handleCopyInstallUrl = () => {
    if (!bot?.installUrl) return;
    navigator.clipboard.writeText(bot.installUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleVerify = async () => {
    try {
      const res = await fetch(`/api/bots/${botId}/verify`, { method: 'POST' });
      if (res.ok) {
        await loadBot();
      }
    } catch (err) {
      console.error('Verify error:', err);
    }
  };

  const handleToggleDisable = async () => {
    try {
      if (bot.status === 'disabled') {
        await fetch(`/api/bots/${botId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ready' }),
        });
      } else {
        await fetch(`/api/bots/${botId}/disable`, { method: 'POST' });
      }
      await loadBot();
    } catch (err) {
      console.error('Disable toggle error:', err);
    }
  };

  const handleRotateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setRotateError(null);
    setIsRotating(true);
    try {
      const res = await fetch(`/api/bots/${botId}/rotate-credential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBotToken: newToken.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Token rotation failed');
      }

      setIsRotateModalOpen(false);
      setNewToken('');
      await loadBot();
    } catch (err: any) {
      setRotateError(err.message);
    } finally {
      setIsRotating(false);
    }
  };

  const handleDeleteBot = async () => {
    if (!confirm('Are you sure you want to remove this bot application? All associated voice connections will be severed.')) {
      return;
    }
    try {
      const res = await fetch(`/api/bots/${botId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/bots');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (isLoading || !bot) {
    return (
      <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
        Loading bot details and permissions diagnostics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* TOP BREADCRUMB & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button
          onClick={() => router.push('/bots')}
          className="flex items-center space-x-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Bot Fleet</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleVerify}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium transition"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Verify Token</span>
          </button>
          <button
            onClick={() => setIsRotateModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate Credential</span>
          </button>
          <button
            onClick={handleToggleDisable}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              bot.status === 'disabled'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-secondary text-muted-foreground border-border'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{bot.status === 'disabled' ? 'Enable Bot' : 'Disable'}</span>
          </button>
          <button
            onClick={handleDeleteBot}
            className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition"
            title="Delete Bot"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BOT HERO CARD */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center text-primary font-bold">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-foreground">{bot.displayName}</h1>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                  bot.status === 'ready' || bot.status === 'connected'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : bot.status === 'disabled'
                    ? 'bg-secondary text-muted-foreground border-border'
                    : 'bg-destructive/10 text-destructive border-destructive/30'
                }`}
              >
                {bot.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">
              Application ID: {bot.applicationId} • Discord Verified User ID: {bot.verifiedBotUserId || 'Verified'}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={bot.installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Install in Server (OAuth2)</span>
          </a>
          <button
            onClick={handleCopyInstallUrl}
            className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground transition"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
      </div>

      {/* CREDENTIAL & SECURITY SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Credential History */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>Credential Storage & Rotation</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Bot tokens are encrypted using AES-256-GCM. Raw tokens are never logged or returned to frontend browsers.
          </p>

          <div className="space-y-2">
            {bot.credentials?.map((cred: any) => (
              <div key={cred.id} className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-foreground">
                    Credential Version {cred.credential_version}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Created {new Date(cred.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    cred.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {cred.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Guild Access & Permissions */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <span>Linked Discord Servers</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Authorized guilds where this bot has verified membership and channel speaking rights.
          </p>

          <div className="space-y-2">
            {bot.guilds?.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/30 rounded-lg">
                Not connected to any servers yet. Click &quot;Install in Server&quot; above to add this bot to your Discord guild.
              </div>
            ) : (
              bot.guilds?.map((g: any) => (
                <div key={g.id} className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-foreground">{g.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Guild ID: {g.guildId}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Verified
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ROTATE TOKEN MODAL */}
      {isRotateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-foreground mb-1">Rotate Discord Bot Token</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter the newly regenerated token from the Discord Developer Portal. The current token will be revoked immediately upon verification.
            </p>

            {rotateError && (
              <div className="p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                {rotateError}
              </div>
            )}

            <form onSubmit={handleRotateCredential} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1">New Bot Token</label>
                <input
                  type="password"
                  required
                  placeholder="Paste new bot token..."
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRotateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRotating}
                  className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold disabled:opacity-50"
                >
                  {isRotating ? 'Verifying...' : 'Rotate & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  Activity,
  Trash2,
  Edit2,
  ExternalLink,
  Layers,
  X,
  FileText,
  Radio,
  Power,
  PowerOff,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { getCachedData, setCachedData } from '@/lib/client-cache';

function BotFleetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  const [bots, setBots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerMode, setRegisterMode] = useState<'single' | 'bulk'>('bulk');
  const [isFleetConnecting, setIsFleetConnecting] = useState(false);
  const [fleetActionMsg, setFleetActionMsg] = useState<string | null>(null);

  // Single Bot Form State
  const [formData, setFormData] = useState({
    botToken: '',
    applicationId: '',
    displayName: '',
    operationalRole: 'voice_operator',
    tags: 'voice, studio',
  });
  const [isInspectingToken, setIsInspectingToken] = useState(false);
  const [tokenResolvedBot, setTokenResolvedBot] = useState<{
    applicationId: string;
    username: string;
    avatarUrl: string | null;
  } | null>(null);

  // Bulk Bot Form State
  const [bulkTokensInput, setBulkTokensInput] = useState('');
  const [bulkRole, setBulkRole] = useState('voice_operator');
  const [bulkTags, setBulkTags] = useState('voice, fleet');
  const [bulkAutoConnect, setBulkAutoConnect] = useState(true);
  const [bulkResult, setBulkResult] = useState<{
    totalSubmitted: number;
    successful: number;
    failed: number;
    addedBots: any[];
    errors: any[];
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsRegisterOpen(true);
    }
  }, [searchParams]);

  const isExcludedBot = (b: any) =>
    b.operationalRole === 'oauth_redirect' ||
    b.applicationId === '1560261747137454161' ||
    b.displayName === 'Roynix Loud' ||
    b.tags?.includes('oauth') ||
    b.tags?.includes('redirect');

  const loadBots = async () => {
    if (!currentWorkspace) return;
    const cacheKey = `workspace:${currentWorkspace.id}:bots`;
    const cached = getCachedData<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setBots(cached.filter((b) => !isExcludedBot(b)));
      setIsLoading(false);
    }
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const filtered = json.data.filter((b: any) => !isExcludedBot(b));
          setBots(filtered);
          setCachedData(cacheKey, filtered, 15000);
        }
      }
    } catch (err) {
      console.error('Failed to load bots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, [currentWorkspace]);

  // Client-side quick decode of Discord Application ID from Token
  const tryClientDecodeAppId = (token: string): string | null => {
    try {
      const parts = token.trim().split('.');
      if (parts.length >= 2 && parts[0]) {
        const decoded = atob(parts[0]);
        if (/^\d{17,20}$/.test(decoded)) {
          return decoded;
        }
      }
    } catch {}
    return null;
  };

  // Inspect token and auto-collect Application ID & name
  const handleTokenChange = async (val: string) => {
    const trimmed = val.trim();
    setFormData((prev) => ({ ...prev, botToken: val }));

    if (!trimmed) {
      setTokenResolvedBot(null);
      return;
    }

    const decodedAppId = tryClientDecodeAppId(trimmed);
    if (decodedAppId && !formData.applicationId) {
      setFormData((prev) => ({ ...prev, applicationId: decodedAppId }));
    }

    if (trimmed.length > 25) {
      try {
        setIsInspectingToken(true);
        const res = await fetch('/api/bots/resolve-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: trimmed }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setTokenResolvedBot(json.data);
            setFormData((prev) => ({
              ...prev,
              applicationId: json.data.applicationId,
              displayName: prev.displayName || json.data.username,
            }));
          }
        }
      } catch (err) {
        console.warn('Could not auto-inspect token:', err);
      } finally {
        setIsInspectingToken(false);
      }
    }
  };

  // Bring ALL workspace bots ONLINE in Discord Gateway
  const handleBringFleetOnline = async () => {
    if (!currentWorkspace) return;
    setIsFleetConnecting(true);
    setFleetActionMsg(null);
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/fleet/connect`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setFleetActionMsg(json.data?.message || 'Brought all fleet bots ONLINE in Discord!');
        await loadBots();
      } else {
        setFleetActionMsg(`Failed: ${json.error?.message || 'Connection error'}`);
      }
    } catch (err: any) {
      setFleetActionMsg(`Error: ${err.message}`);
    } finally {
      setIsFleetConnecting(false);
      setTimeout(() => setFleetActionMsg(null), 5000);
    }
  };

  // Disconnect ALL workspace bots from Discord Gateway (Go Offline)
  const handleDisconnectFleet = async () => {
    if (!currentWorkspace) return;
    setIsFleetConnecting(true);
    setFleetActionMsg(null);
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/fleet/disconnect`, {
        method: 'POST',
      });
      const json = await res.json();
      if (res.ok) {
        setFleetActionMsg('All fleet bots disconnected from Discord (Offline).');
        await loadBots();
      }
    } catch (err: any) {
      setFleetActionMsg(`Error: ${err.message}`);
    } finally {
      setIsFleetConnecting(false);
      setTimeout(() => setFleetActionMsg(null), 5000);
    }
  };

  // Toggle single bot connection to Discord Gateway
  const handleToggleSingleBot = async (botId: string, currentlyOnline: boolean) => {
    try {
      const endpoint = currentlyOnline
        ? `/api/bots/${botId}/disconnect`
        : `/api/bots/${botId}/connect`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        await loadBots();
      }
    } catch (err) {
      console.error('Bot toggle error:', err);
    }
  };

  // Submit Single Bot
  const handleRegisterSingleBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: formData.botToken.trim(),
          applicationId: formData.applicationId.trim() || undefined,
          displayName: formData.displayName.trim() || undefined,
          operationalRole: formData.operationalRole,
          tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Bot registration failed');
      }

      setIsRegisterOpen(false);
      setFormData({
        botToken: '',
        applicationId: '',
        displayName: '',
        operationalRole: 'voice_operator',
        tags: 'voice, studio',
      });
      setTokenResolvedBot(null);
      await loadBots();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Bulk Bots
  const handleRegisterBulkBots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !bulkTokensInput.trim()) return;
    setFormError(null);
    setBulkResult(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: bulkTokensInput,
          operationalRole: bulkRole,
          tags: bulkTags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Bulk bot import failed');
      }

      setBulkResult(json.data);

      // Auto-connect fleet if enabled
      if (bulkAutoConnect) {
        await fetch(`/api/workspaces/${currentWorkspace.id}/fleet/connect`, { method: 'POST' });
      }

      await loadBots();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHealthCheck = async (botId: string) => {
    try {
      const res = await fetch(`/api/bots/${botId}/health-check`, { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        await loadBots();
      }
    } catch (err) {
      console.error('Health check error:', err);
    }
  };

  const onlineBotsCount = bots.filter((b) => !isExcludedBot(b) && (b.online || b.status === 'connected')).length;

  const filteredBots = bots.filter((b) => {
    if (isExcludedBot(b)) return false;
    const matchesSearch =
      b.displayName.toLowerCase().includes(search.toLowerCase()) ||
      b.applicationId.includes(search);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'online' && (b.online || b.status === 'connected')) ||
      (statusFilter === 'ready' && (b.status === 'ready' || b.status === 'connected')) ||
      (statusFilter === 'degraded' && (b.status === 'degraded' || b.status === 'credential_invalid')) ||
      (statusFilter === 'disabled' && b.status === 'disabled');
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            <span>Bot Fleet Registry</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Independently verified official Discord bot applications, live Gateway connections, and voice privileges.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setRegisterMode('bulk');
              setIsRegisterOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border shadow-sm transition"
          >
            <Layers className="w-4 h-4 text-primary" />
            <span>Bulk Add Tokens</span>
          </button>
          <button
            onClick={() => {
              setRegisterMode('single');
              setIsRegisterOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Single Bot</span>
          </button>
        </div>
      </div>

      {/* FLEET GATEWAY STATUS & BRING ONLINE BAR */}
      <div className="p-3.5 rounded-lg bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center">
            <div
              className={`w-3 h-3 rounded-full ${
                onlineBotsCount > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              }`}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>Discord Gateway Fleet Status:</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                  onlineBotsCount > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-secondary text-muted-foreground border border-border'
                }`}
              >
                {onlineBotsCount} of {bots.length} Bots Online
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Connected bots maintain active Gateway WebSocket connections and respond to prefix commands.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleBringFleetOnline}
            disabled={isFleetConnecting || bots.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition disabled:opacity-50"
          >
            <Wifi className={`w-3.5 h-3.5 ${isFleetConnecting ? 'animate-spin' : ''}`} />
            <span>{isFleetConnecting ? 'Connecting...' : 'Bring All Online'}</span>
          </button>

          <button
            onClick={handleDisconnectFleet}
            disabled={isFleetConnecting || onlineBotsCount === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-medium border border-border transition disabled:opacity-50"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>Disconnect Fleet</span>
          </button>
        </div>
      </div>

      {fleetActionMsg && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 text-xs text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          <span>{fleetActionMsg}</span>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
        <div className="flex items-center bg-secondary/60 rounded-lg px-3 py-1.5 border border-border flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground mr-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by bot name or application ID..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="flex items-center space-x-2">
          {['all', 'online', 'ready', 'degraded', 'disabled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize font-medium transition ${
                statusFilter === st
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* BOT LIST CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBots.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl">
            <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-semibold text-foreground">No Discord bots found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {search
                ? 'Try modifying your search query or filter.'
                : 'Register your Discord bot tokens individually or using bulk import to bring them online and stream live voice.'}
            </p>
          </div>
        ) : (
          filteredBots.map((bot) => {
            const isBotOnline = bot.online || bot.status === 'connected';
            return (
              <div
                key={bot.id}
                className="bg-card border border-border hover:border-primary/40 rounded-xl p-5 shadow-sm transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary font-bold">
                          <Bot className="w-6 h-6" />
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card ${
                            isBotOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                          }`}
                        />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{bot.displayName}</h3>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          ID: {bot.applicationId}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                        isBotOnline
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : bot.status === 'disabled'
                          ? 'bg-secondary text-muted-foreground border-border'
                          : 'bg-secondary text-muted-foreground border-border'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isBotOnline ? 'bg-emerald-400' : 'bg-muted-foreground'
                        }`}
                      />
                      <span>{isBotOnline ? 'Online' : 'Offline'}</span>
                    </span>
                  </div>

                  {/* Details list */}
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Role:</span>
                      <span className="font-medium text-foreground capitalize">
                        {bot.operationalRole?.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Credentials:</span>
                      {bot.credential ? (
                        <span className="font-mono text-[11px] text-foreground bg-secondary px-2 py-0.5 rounded">
                          v{bot.credential.version} • {bot.credential.maskedToken}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                          No Token Attached
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Guilds linked:</span>
                      <span className="font-medium text-foreground">{bot.guilds?.length || 0} servers</span>
                    </div>
                  </div>

                  {/* Tags */}
                  {bot.tags && bot.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {bot.tags.map((t: string) => (
                        <span
                          key={t}
                          className="text-[10px] bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <button
                    onClick={() => handleToggleSingleBot(bot.id, isBotOnline)}
                    disabled={!bot.credential}
                    className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      !bot.credential
                        ? 'opacity-40 cursor-not-allowed bg-secondary text-muted-foreground border-border'
                        : isBotOnline
                        ? 'bg-secondary hover:bg-secondary/80 text-muted-foreground border-border'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600'
                    }`}
                  >
                    {isBotOnline ? (
                      <>
                        <PowerOff className="w-3 h-3" />
                        <span>Go Offline</span>
                      </>
                    ) : (
                      <>
                        <Power className="w-3 h-3" />
                        <span>{!bot.credential ? 'No Token' : 'Go Online'}</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleHealthCheck(bot.id)}
                      title="Run Ping / Health Check"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition flex items-center gap-1 text-xs"
                    >
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      <span>Ping</span>
                    </button>

                    <button
                      onClick={() => router.push(`/bots/${bot.id}`)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition"
                    >
                      Configure
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* REGISTER BOT MODAL (SINGLE OR BULK) */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 relative my-8">
            <button
              onClick={() => {
                setIsRegisterOpen(false);
                setBulkResult(null);
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header & Tabs */}
            <div className="mb-5 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Register Official Discord Bots</h2>
                  <p className="text-xs text-muted-foreground">Tokens are encrypted at rest with AES-256-GCM.</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center space-x-1 bg-secondary/60 p-1 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterMode('bulk');
                    setFormError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    registerMode === 'bulk'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Bulk Add Tokens
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterMode('single');
                    setFormError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    registerMode === 'single'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Single Bot
                </button>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* SINGLE BOT TAB */}
            {registerMode === 'single' && (
              <form onSubmit={handleRegisterSingleBot} className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Discord Bot Token (Secret) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Paste bot token here (Application ID will auto-detect)..."
                    value={formData.botToken}
                    onChange={(e) => handleTokenChange(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    Pasting your token will instantly collect the Application ID, bring the bot online, and verify identity.
                  </span>
                </div>

                {tokenResolvedBot && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-3 text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-foreground">
                        Verified Discord Bot: <span className="text-emerald-400">{tokenResolvedBot.username}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Auto-collected Application ID: {tokenResolvedBot.applicationId}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-foreground mb-1">
                      Discord Application ID (Auto-Filled)
                    </label>
                    <input
                      type="text"
                      placeholder="Auto-detected from token"
                      value={formData.applicationId}
                      onChange={(e) => setFormData({ ...formData, applicationId: e.target.value })}
                      className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-foreground mb-1">Friendly Bot Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Studio Voice Alpha"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">Operational Role</label>
                  <select
                    value={formData.operationalRole}
                    onChange={(e) => setFormData({ ...formData, operationalRole: e.target.value })}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                  >
                    <option value="voice_operator">Voice Operator</option>
                    <option value="announcer">Announcer</option>
                    <option value="moderator">Moderator</option>
                    <option value="general">General Operations</option>
                  </select>
                </div>

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.botToken}
                    className="px-5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Registering & Bringing Online...' : 'Save & Bring Online'}
                  </button>
                </div>
              </form>
            )}

            {/* BULK BOT TAB */}
            {registerMode === 'bulk' && (
              <form onSubmit={handleRegisterBulkBots} className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-foreground">
                      Paste Bot Tokens (One per line) <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {bulkTokensInput.trim() ? bulkTokensInput.trim().split(/\r?\n/).filter(Boolean).length : 0} tokens detected
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    placeholder="MTIxNDQ4OTAwMTg5NDI3MzA1OA.Gh81j9...&#10;MTIyNDQ4OTAwMTg5NDI3MzA1OQ.Xj89k2...&#10;MTIzNDQ4OTAwMTg5NDI3MzA2MA.Zk90l3..."
                    value={bulkTokensInput}
                    onChange={(e) => setBulkTokensInput(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg p-3 text-foreground font-mono outline-none focus:border-primary text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    Paste up to 50 tokens. The Application ID and Bot Name are automatically resolved for each bot.
                  </span>
                </div>

                {/* Auto-connect checkbox */}
                <label className="flex items-center space-x-2 cursor-pointer p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <input
                    type="checkbox"
                    checked={bulkAutoConnect}
                    onChange={(e) => setBulkAutoConnect(e.target.checked)}
                    className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="text-[11px] text-foreground">
                    <strong className="text-emerald-400">Auto-connect to Discord Gateway:</strong> Immediately brings all bots <strong>ONLINE (green dot in Discord)</strong> after saving.
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-foreground mb-1">Operational Role</label>
                    <select
                      value={bulkRole}
                      onChange={(e) => setBulkRole(e.target.value)}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                    >
                      <option value="voice_operator">Voice Operator</option>
                      <option value="announcer">Announcer</option>
                      <option value="general">General Operations</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-foreground mb-1">Tags (Comma-separated)</label>
                    <input
                      type="text"
                      value={bulkTags}
                      onChange={(e) => setBulkTags(e.target.value)}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                    />
                  </div>
                </div>

                {/* Bulk Results Summary */}
                {bulkResult && (
                  <div className="p-3.5 rounded-lg bg-secondary/60 border border-border space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-foreground">Registration &amp; Gateway Results:</span>
                      <span className="text-emerald-400 font-mono">
                        {bulkResult.successful} Online / {bulkResult.totalSubmitted} Submitted
                      </span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {bulkResult.addedBots?.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between p-2 rounded bg-background/60 border border-emerald-500/30 text-[11px]"
                        >
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span>{b.displayName}</span>
                            <span className="text-muted-foreground font-mono">({b.applicationId})</span>
                          </span>
                          <span className="text-emerald-400 font-bold uppercase text-[10px]">Online</span>
                        </div>
                      ))}

                      {bulkResult.errors?.map((err, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded bg-background/60 border border-destructive/30 text-[11px]"
                        >
                          <span className="text-destructive flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Token #{err.tokenIndex}: {err.error}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterOpen(false);
                      setBulkResult(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground font-medium text-xs transition"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !bulkTokensInput.trim()}
                    className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Registering & Connecting Fleet...' : 'Save & Bring Fleet Online'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotFleetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading Bot Fleet...</div>}>
      <BotFleetContent />
    </Suspense>
  );
}

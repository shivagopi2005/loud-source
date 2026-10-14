'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Shield,
  Activity,
  RotateCw,
  Sliders,
  X,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

function BotFleetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  const [bots, setBots] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Form state for Add Bot
  const [formData, setFormData] = useState({
    displayName: '',
    applicationId: '',
    botToken: '',
    operationalRole: 'voice_operator',
    tags: 'voice, studio',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsRegisterOpen(true);
    }
  }, [searchParams]);

  const loadBots = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setBots(json.data);
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

  const handleRegisterBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: formData.displayName,
          applicationId: formData.applicationId.trim(),
          botToken: formData.botToken.trim(),
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
        displayName: '',
        applicationId: '',
        botToken: '',
        operationalRole: 'voice_operator',
        tags: 'voice, studio',
      });
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

  const filteredBots = bots.filter((b) => {
    const matchesSearch =
      b.displayName.toLowerCase().includes(search.toLowerCase()) ||
      b.applicationId.includes(search);
    const matchesStatus =
      statusFilter === 'all' ||
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bot Fleet Registry</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Independently verified official Discord bot applications, credentials, and guild permissions.
          </p>
        </div>

        <button
          onClick={() => setIsRegisterOpen(true)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Official Bot</span>
        </button>
      </div>

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
          {['all', 'ready', 'degraded', 'disabled'].map((st) => (
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
              {search ? 'Try modifying your search query or filter.' : 'Register your first Discord bot token to enable live voice streaming and fleet controls.'}
            </p>
          </div>
        ) : (
          filteredBots.map((bot) => (
            <div
              key={bot.id}
              className="bg-card border border-border hover:border-primary/40 rounded-xl p-5 shadow-sm transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary font-bold">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{bot.displayName}</h3>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        ID: {bot.applicationId}
                      </div>
                    </div>
                  </div>

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

                {/* Details list */}
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Role:</span>
                    <span className="font-medium text-foreground capitalize">{bot.operationalRole?.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Credentials:</span>
                    <span className="font-mono text-[11px] text-foreground bg-secondary px-2 py-0.5 rounded">
                      v{bot.credential?.version || 1} • {bot.credential?.maskedToken || '••••••••'}
                    </span>
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
                      <span key={t} className="text-[10px] bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-5 pt-3 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => handleHealthCheck(bot.id)}
                  title="Run Ping / Health Check"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition flex items-center gap-1 text-xs"
                >
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  <span>Check</span>
                </button>

                <button
                  onClick={() => router.push(`/bots/${bot.id}`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition"
                >
                  Configure
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ADD BOT MODAL DIALOG */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setIsRegisterOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Register Official Discord Bot</h2>
                <p className="text-xs text-muted-foreground">Tokens are encrypted at rest with AES-256-GCM.</p>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterBot} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1">Friendly Bot Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Studio Alpha Voice Bot"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">Discord Application ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 1204489001894273058"
                  value={formData.applicationId}
                  onChange={(e) => setFormData({ ...formData, applicationId: e.target.value })}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                />
                <span className="text-[11px] text-muted-foreground">Found in Discord Developer Portal &gt; General Information</span>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">Discord Bot Token (Secret)</label>
                <input
                  type="password"
                  required
                  placeholder="Paste official bot token or 'mock_test_token' for simulator..."
                  value={formData.botToken}
                  onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                />
                <span className="text-[11px] text-muted-foreground">Verified against Discord API upon submission. Never logged or exposed.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-foreground mb-1">Operational Role</label>
                  <select
                    value={formData.operationalRole}
                    onChange={(e) => setFormData({ ...formData, operationalRole: e.target.value })}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                  >
                    <option value="voice_operator">Voice Operator</option>
                    <option value="announcer">Announcer</option>
                    <option value="test_runner">Test Runner</option>
                    <option value="general_operator">General Fleet Bot</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying with Discord...' : 'Verify & Save Bot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotFleetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground animate-pulse">Loading bot fleet...</div>}>
      <BotFleetContent />
    </Suspense>
  );
}


'use client';

import React, { useState, useEffect } from 'react';
import {
  Server,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Bot,
  Plus,
  RefreshCw,
  Hash,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function ServersPage() {
  const { currentWorkspace } = useWorkspace();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [guildIdInput, setGuildIdInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const [guildsRes, botsRes] = await Promise.all([
        fetch(`/api/workspaces/${currentWorkspace.id}/guilds`),
        fetch(`/api/workspaces/${currentWorkspace.id}/bots`),
      ]);

      if (guildsRes.ok && botsRes.ok) {
        const gData = await guildsRes.json();
        const bData = await botsRes.json();
        if (gData.data) setGuilds(gData.data);
        if (bData.data) {
          setBots(bData.data);
          if (bData.data.length > 0 && !selectedBotId) {
            setSelectedBotId(bData.data[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load server data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWorkspace]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);

  const handleVerifyGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !selectedBotId || !guildIdInput) return;
    setWizardError(null);
    setWizardSuccess(null);
    setIsVerifying(true);

    try {
      const res = await fetch('/api/guilds/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          guildId: guildIdInput.trim(),
          botId: selectedBotId,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Guild verification failed');
      }

      setWizardSuccess(`Successfully verified membership in "${json.data.name}"!`);
      setGuildIdInput('');
      await loadData();
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            <span>Connected Discord Servers</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Authorised guilds verified with active bot memberships and speaking privileges.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Server</span>
        </button>
      </div>

      {/* GUILD CONNECTION WIZARD (PRD Section 7.1) */}
      {isWizardOpen && (
        <div className="bg-card border border-primary/40 rounded-xl p-6 shadow-xl space-y-5 relative">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Discord Server Setup Wizard</h2>
              <p className="text-xs text-muted-foreground">Follow the steps below to authorize a bot in your Discord guild.</p>
            </div>
            <button
              onClick={() => setIsWizardOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Step 1 */}
            <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">1</span>
                <span>Select Bot</span>
              </div>
              <p className="text-muted-foreground text-[11px]">Choose which registered bot to install.</p>
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground outline-none"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">2</span>
                <span>Install Bot</span>
              </div>
              <p className="text-muted-foreground text-[11px]">Open the official Discord OAuth2 invite with required permissions.</p>
              {selectedBot ? (
                <a
                  href={`https://discord.com/oauth2/authorize?client_id=${selectedBot.applicationId}&permissions=3148800&scope=bot%20applications.commands`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold text-xs transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Discord Invite</span>
                </a>
              ) : (
                <span className="text-muted-foreground text-xs">No bot selected</span>
              )}
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">3</span>
                <span>Verify Access</span>
              </div>
              <p className="text-muted-foreground text-[11px]">Enter your Server (Guild) ID to verify membership.</p>
              <form onSubmit={handleVerifyGuild} className="space-y-2">
                <input
                  type="text"
                  required
                  placeholder="e.g. 888888888888888888"
                  value={guildIdInput}
                  onChange={(e) => setGuildIdInput(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-foreground font-mono outline-none"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Guild'}
                </button>
              </form>
            </div>
          </div>

          {wizardError && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{wizardError}</span>
            </div>
          )}

          {wizardSuccess && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{wizardSuccess}</span>
            </div>
          )}
        </div>
      )}

      {/* GUILD LIST CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {guilds.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            No Discord servers linked yet. Click &quot;Connect Server&quot; above to verify your Discord server.
          </div>
        ) : (
          guilds.map((guild) => (
            <div key={guild.id} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-primary font-bold">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{guild.displayName}</h3>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Guild ID: {guild.guildId}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {guild.verificationStatus}
                </span>
              </div>

              {/* Bot Memberships in Guild */}
              <div className="text-xs space-y-1.5 pt-2 border-t border-border/40">
                <div className="text-muted-foreground font-medium">Installed Bots ({guild.bots?.length || 0}):</div>
                <div className="flex flex-wrap gap-1.5">
                  {guild.bots?.map((b: any) => (
                    <span
                      key={b.botId}
                      className="inline-flex items-center gap-1 text-[11px] bg-secondary px-2.5 py-1 rounded-md text-foreground font-medium"
                    >
                      <Bot className="w-3.5 h-3.5 text-primary" />
                      <span>{b.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Configured Channels */}
              <div className="text-xs space-y-1 pt-2 border-t border-border/40">
                <div className="text-muted-foreground font-medium">Configured Channels ({guild.channels?.length || 0}):</div>
                <div className="flex flex-wrap gap-1">
                  {guild.channels?.map((ch: any) => (
                    <span
                      key={ch.id}
                      className="text-[10px] bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1"
                    >
                      <Hash className="w-3 h-3 text-primary" />
                      <span>{ch.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

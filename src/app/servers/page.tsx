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
  Volume2,
  Copy,
  Users,
  Check,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function ServersPage() {
  const { currentWorkspace } = useWorkspace();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'all' | 'single'>('all');
  const [selectedBotId, setSelectedBotId] = useState('');
  const [guildIdInput, setGuildIdInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [syncingGuildId, setSyncingGuildId] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<string | null>(null);
  const [copiedLinks, setCopiedLinks] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);

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
  const readyBots = bots.filter((b) => b.status === 'ready' || b.status === 'connected');

  // Open invite URLs for all bots in separate browser tabs
  const handleOpenAllInvites = () => {
    readyBots.forEach((b) => {
      const url = `https://discord.com/oauth2/authorize?client_id=${b.applicationId}&permissions=3148800&scope=bot%20applications.commands`;
      window.open(url, '_blank');
    });
  };

  // Copy all invite links to clipboard
  const handleCopyAllInvites = () => {
    const text = readyBots
      .map(
        (b) =>
          `${b.displayName}: https://discord.com/oauth2/authorize?client_id=${b.applicationId}&permissions=3148800&scope=bot%20applications.commands`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLinks(true);
    setTimeout(() => setCopiedLinks(false), 2500);
  };

  // Verify single bot in guild
  const handleVerifySingleGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !selectedBotId || !guildIdInput) return;
    setWizardError(null);
    setWizardSuccess(null);
    setBulkResult(null);
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

  // Verify & connect ALL bots to guild in one click
  const handleBulkVerifyGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !guildIdInput.trim()) return;
    setWizardError(null);
    setWizardSuccess(null);
    setBulkResult(null);
    setIsVerifying(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/guilds/bulk-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: guildIdInput.trim(),
          autoSyncChannels: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Bulk guild verification failed');
      }

      setBulkResult(json.data);
      setWizardSuccess(
        `Successfully linked ${json.data.connectedCount} of ${json.data.totalBots} bots to "${json.data.guildConnection.displayName}" and auto-discovered ${json.data.discoveredChannels} voice & text channels!`
      );
      setGuildIdInput('');
      await loadData();
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Quick Sync All Bots for an existing guild card
  const handleQuickSyncAllBots = async (guildId: string) => {
    if (!currentWorkspace) return;
    setSyncingGuildId(guildId);
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/guilds/bulk-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId,
          autoSyncChannels: true,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        await loadData();
      } else {
        alert(json.error?.message || 'Sync failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingGuildId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            <span>Connected Discord Servers</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Authorised guilds verified with active bot memberships, speaking privileges, and auto-discovered voice channels.
          </p>
        </div>

        <button
          onClick={() => {
            setIsWizardOpen(true);
            setWizardError(null);
            setWizardSuccess(null);
            setBulkResult(null);
          }}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Server</span>
        </button>
      </div>

      {/* GUILD CONNECTION WIZARD */}
      {isWizardOpen && (
        <div className="bg-card border border-primary/40 rounded-xl p-6 shadow-xl space-y-5 relative">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Discord Server Setup &amp; Fleet Join</h2>
              <p className="text-xs text-muted-foreground">
                Authorize your bots in your Discord server and verify membership in one step.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center space-x-2">
              <div className="flex bg-secondary p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setWizardMode('all')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    wizardMode === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Connect All Bots (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setWizardMode('single')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    wizardMode === 'single'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Single Bot
                </button>
              </div>

              <button
                onClick={() => setIsWizardOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground ml-2"
              >
                Close
              </button>
            </div>
          </div>

          {/* ALL BOTS MODE */}
          {wizardMode === 'all' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Step 1: Invite All Bots */}
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                  <div className="font-bold text-primary flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                      1
                    </span>
                    <span>Invite All Registered Bots ({readyBots.length} Bots)</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Discord requires each bot to be invited once. Click below to open all official OAuth2 invite tabs or copy their links:
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleOpenAllInvites}
                      disabled={readyBots.length === 0}
                      className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition disabled:opacity-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open All ({readyBots.length}) Bot Invites</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyAllInvites}
                      disabled={readyBots.length === 0}
                      className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs transition disabled:opacity-50"
                    >
                      {copiedLinks ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLinks ? 'Copied Links!' : 'Copy Invite URLs'}</span>
                    </button>
                  </div>

                  {/* Bot Pill Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                    {readyBots.map((b) => (
                      <span
                        key={b.id}
                        className="inline-flex items-center gap-1 text-[11px] bg-background/80 px-2 py-0.5 rounded border border-border/60 text-foreground"
                      >
                        <Bot className="w-3 h-3 text-primary" />
                        <span>{b.displayName}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Step 2: One-Click Bulk Server Join & Channel Auto-Sync */}
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                  <div className="font-bold text-primary flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                      2
                    </span>
                    <span>Join &amp; Verify All Bots to Server</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Enter your Discord Server (Guild) ID to verify all fleet bots and auto-discover all voice channels in one click.
                  </p>

                  <form onSubmit={handleBulkVerifyGuild} className="space-y-2">
                    <input
                      type="text"
                      required
                      placeholder="e.g. 888888888888888888"
                      value={guildIdInput}
                      onChange={(e) => setGuildIdInput(e.target.value)}
                      className="w-full bg-card border border-border rounded-md px-3 py-2 text-foreground font-mono outline-none text-xs"
                    />
                    <button
                      type="submit"
                      disabled={isVerifying || readyBots.length === 0}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50 shadow-md"
                    >
                      <Users className="w-4 h-4" />
                      <span>{isVerifying ? 'Joining & Verifying All Bots...' : 'Connect All Bots to Server'}</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* Bulk Results Table */}
              {bulkResult && (
                <div className="p-3.5 rounded-lg bg-secondary/60 border border-border text-xs space-y-2">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>Connection Summary for {bulkResult.guildConnection.displayName}:</span>
                    <span className="text-emerald-400 font-mono">
                      {bulkResult.connectedCount} / {bulkResult.totalBots} Bots Connected
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {bulkResult.connectedBots?.map((b: any) => (
                      <div
                        key={b.botId}
                        className="p-2 rounded bg-background/60 border border-emerald-500/30 flex items-center justify-between"
                      >
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{b.displayName}</span>
                        </span>
                        <span className="text-[10px] text-emerald-400 uppercase font-bold">Active</span>
                      </div>
                    ))}
                    {bulkResult.failedBots?.map((b: any) => (
                      <div
                        key={b.botId}
                        className="p-2 rounded bg-background/60 border border-destructive/30 flex items-center justify-between"
                      >
                        <span className="font-medium text-destructive flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          <span>{b.displayName}</span>
                        </span>
                        <span className="text-[10px] text-destructive truncate max-w-[120px]">{b.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SINGLE BOT MODE */}
          {wizardMode === 'single' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                    1
                  </span>
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

              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                    2
                  </span>
                  <span>Install Bot</span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Open official Discord OAuth2 invite with required permissions.
                </p>
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

              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                    3
                  </span>
                  <span>Verify Access</span>
                </div>
                <p className="text-muted-foreground text-[11px]">Enter your Server (Guild) ID to verify membership.</p>
                <form onSubmit={handleVerifySingleGuild} className="space-y-2">
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
          )}

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
            No Discord servers linked yet. Click &quot;Connect Server&quot; above to connect your bots to a Discord server.
          </div>
        ) : (
          guilds.map((guild) => {
            const connectedBotCount = guild.bots?.length || 0;
            const totalWorkspaceBots = bots.length;
            const allBotsConnected = connectedBotCount >= totalWorkspaceBots && totalWorkspaceBots > 0;

            return (
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

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleQuickSyncAllBots(guild.guildId)}
                      disabled={syncingGuildId === guild.guildId}
                      className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-semibold text-foreground flex items-center gap-1 transition"
                      title="Sync all registered bots into this server"
                    >
                      <RefreshCw className={`w-3 h-3 text-primary ${syncingGuildId === guild.guildId ? 'animate-spin' : ''}`} />
                      <span>{syncingGuildId === guild.guildId ? 'Syncing...' : 'Sync All Bots'}</span>
                    </button>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        allBotsConnected
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {connectedBotCount} / {totalWorkspaceBots} Bots
                    </span>
                  </div>
                </div>

                {/* Bot Memberships in Guild */}
                <div className="text-xs space-y-1.5 pt-2 border-t border-border/40">
                  <div className="text-muted-foreground font-medium flex items-center justify-between">
                    <span>Installed Fleet Bots ({connectedBotCount}):</span>
                    {!allBotsConnected && (
                      <span className="text-[10px] text-amber-400">
                        {totalWorkspaceBots - connectedBotCount} bot(s) not yet synced
                      </span>
                    )}
                  </div>
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
                  <div className="text-muted-foreground font-medium flex items-center justify-between">
                    <span>Voice &amp; Text Channels ({guild.channels?.length || 0}):</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {guild.channels?.map((ch: any) => (
                      <span
                        key={ch.id}
                        className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 border ${
                          ch.type === 2 || ch.type === 13
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-secondary/80 text-muted-foreground border-border/60'
                        }`}
                      >
                        {ch.type === 2 || ch.type === 13 ? (
                          <Volume2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Hash className="w-3 h-3 text-primary" />
                        )}
                        <span>{ch.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

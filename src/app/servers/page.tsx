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
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Shield,
  UserCheck,
  Sparkles,
  Info,
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
  const [guildIdInput, setGuildIdInput] = useState('1316627667180851211');
  const [isVerifying, setIsVerifying] = useState(false);
  const [syncingGuildId, setSyncingGuildId] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardSuccess, setWizardSuccess] = useState<string | null>(null);
  const [copiedLinks, setCopiedLinks] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [joinerIndex, setJoinerIndex] = useState(0);
  const [openedBotIds, setOpenedBotIds] = useState<Record<string, boolean>>({});
  const [popupBlocked, setPopupBlocked] = useState(false);

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
          // Filter out any mock/test bots that lack active credentials
          const realBots = bData.data.filter(
            (b: any) => b.applicationId !== '990000000000000099'
          );
          setBots(realBots);
          if (realBots.length > 0 && !selectedBotId) {
            setSelectedBotId(realBots[0].id);
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

  // Build 0-permission invite URL ("join like humans" with default @everyone permissions)
  const getBotInviteUrl = (applicationId: string, guildId?: string) => {
    const targetGuild = (guildId !== undefined ? guildId : guildIdInput).trim();
    let url = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot&permissions=0`;
    if (targetGuild) {
      url += `&guild_id=${targetGuild}&disable_guild_select=true`;
    }
    return url;
  };

  const markBotOpened = (botId: string) => {
    setOpenedBotIds((prev) => ({ ...prev, [botId]: true }));
  };

  // Open invite URL for current sequential bot and advance
  const handleJoinNextBot = () => {
    if (readyBots.length === 0) return;
    const currentBot = readyBots[joinerIndex] || readyBots[0];
    const url = getBotInviteUrl(currentBot.applicationId);
    markBotOpened(currentBot.id);
    const win = window.open(url, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      setPopupBlocked(true);
    }
    if (joinerIndex < readyBots.length - 1) {
      setJoinerIndex(joinerIndex + 1);
    }
  };

  // Open a specific batch of bots (e.g. 0 to 4, 4 to 8)
  const handleOpenBatch = (startIndex: number, count: number) => {
    setPopupBlocked(false);
    const batch = readyBots.slice(startIndex, startIndex + count);
    batch.forEach((b, idx) => {
      setTimeout(() => {
        const url = getBotInviteUrl(b.applicationId);
        markBotOpened(b.id);
        const win = window.open(url, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          setPopupBlocked(true);
        }
      }, idx * 250);
    });
  };

  // Open invite URLs for all bots in separate browser tabs with slight stagger
  const handleOpenAllInvites = () => {
    setPopupBlocked(false);
    readyBots.forEach((b, idx) => {
      setTimeout(() => {
        const url = getBotInviteUrl(b.applicationId);
        markBotOpened(b.id);
        const win = window.open(url, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          setPopupBlocked(true);
        }
      }, idx * 200);
    });
  };

  // Copy all invite links to clipboard
  const handleCopyAllInvites = () => {
    const text = readyBots
      .map((b, i) => `Bot #${i + 1} (${b.displayName}): ${getBotInviteUrl(b.applicationId)}`)
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
      await loadData();
    } catch (err: any) {
      setWizardError(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify & connect ALL bots to guild in one click
  const handleBulkVerifyGuild = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentWorkspace || !guildIdInput.trim()) return;
    setWizardError(null);
    setWizardSuccess(null);
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
        if (json.details?.failedBots) {
          setBulkResult({
            guildConnection: { displayName: `Guild ${guildIdInput.trim()}` },
            connectedCount: 0,
            totalBots: json.details.failedBots.length,
            connectedBots: [],
            failedBots: json.details.failedBots,
          });
        }
        throw new Error(json.error?.message || 'Bulk guild verification failed');
      }

      setBulkResult(json.data);
      setWizardSuccess(
        `Successfully connected ${json.data.connectedCount} of ${json.data.totalBots} bots to "${json.data.guildConnection.displayName}" with auto-discovered ${json.data.discoveredChannels} channels!`
      );
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

  const currentSequentialBot = readyBots[joinerIndex] || readyBots[0];
  const openedCount = Object.keys(openedBotIds).length;

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
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Discord Server Setup &amp; Fleet Join</h2>
                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                  <UserCheck className="w-3 h-3" />
                  <span>0 Permissions Mode (Join Like Humans)</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bots join without requesting any special permissions (default @everyone), exactly like human users.
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
                  Connect All ({readyBots.length} Bots)
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

          {/* TARGET GUILD ID INPUT */}
          <div className="p-3 bg-secondary/40 border border-border/80 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="text-xs shrink-0 font-medium text-foreground flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-primary" />
              <span>Target Discord Server (Guild) ID:</span>
            </div>
            <input
              type="text"
              placeholder="e.g. 1316627667180851211"
              value={guildIdInput}
              onChange={(e) => setGuildIdInput(e.target.value)}
              className="flex-1 bg-card border border-border rounded-md px-3 py-1.5 text-foreground font-mono outline-none text-xs"
            />
            <span className="text-[11px] text-muted-foreground">
              {guildIdInput ? 'Invites will auto-target this server.' : 'Type server ID to preselect.'}
            </span>
          </div>

          {/* POPUP BLOCKER ADVISORY */}
          {popupBlocked && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold">Pop-ups blocked by your browser: </span>
                <span>
                  Chrome/Firefox blocks opening multiple tabs at once. Look at the right side of your browser URL bar, click the pop-up icon, and select <strong>&quot;Always allow pop-ups from this site&quot;</strong>, or use the 1-click Sequential Stepper or 4-Bot Batch buttons below!
                </span>
              </div>
            </div>
          )}

          {/* ALL BOTS MODE */}
          {wizardMode === 'all' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Step 1: Sequential & Batch Joiners with 0 Permissions */}
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                  <div className="font-bold text-primary flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                        1
                      </span>
                      <span>Authorize Fleet ({readyBots.length} Bots)</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">
                      0 Perms (@everyone)
                    </span>
                  </div>

                  {/* Sequential 1-Click Fast Stepper (Recommended) */}
                  {readyBots.length > 0 && currentSequentialBot && (
                    <div className="p-3.5 bg-background/90 border border-emerald-500/30 rounded-lg space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Bot className="w-4 h-4 text-emerald-400" />
                          <span>Bot #{joinerIndex + 1} of {readyBots.length}: {currentSequentialBot.displayName}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          App ID: {currentSequentialBot.applicationId.slice(-6)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleJoinNextBot}
                          className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Authorize #{joinerIndex + 1} &amp; Next (0 Perms)</span>
                        </button>

                        <button
                          type="button"
                          disabled={joinerIndex === 0}
                          onClick={() => setJoinerIndex(Math.max(0, joinerIndex - 1))}
                          className="p-2.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border disabled:opacity-40"
                          title="Previous bot"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={joinerIndex >= readyBots.length - 1}
                          onClick={() => setJoinerIndex(Math.min(readyBots.length - 1, joinerIndex + 1))}
                          className="p-2.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border disabled:opacity-40"
                          title="Next bot"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Stepper progress</span>
                          <span>{openedCount} / {readyBots.length} bots opened</span>
                        </div>
                        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-300"
                            style={{ width: `${(Math.max(joinerIndex + 1, openedCount) / readyBots.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4-Bot Batch Launchers (Never blocked by browsers) */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-foreground">Or open in safe 4-bot batches:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenBatch(0, 4)}
                        className="px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-medium text-foreground transition text-center"
                      >
                        Bots 1 – 4
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBatch(4, 4)}
                        className="px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-medium text-foreground transition text-center"
                      >
                        Bots 5 – 8
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBatch(8, 4)}
                        className="px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-medium text-foreground transition text-center"
                      >
                        Bots 9 – 12
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenBatch(12, 4)}
                        className="px-2 py-1.5 rounded bg-secondary hover:bg-secondary/80 border border-border text-[11px] font-medium text-foreground transition text-center"
                      >
                        Bots 13 – {readyBots.length}
                      </button>
                    </div>
                  </div>

                  {/* Batch Open & Copy */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                    <button
                      type="button"
                      onClick={handleOpenAllInvites}
                      disabled={readyBots.length === 0}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition disabled:opacity-50"
                      title="Requires popup permissions enabled in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open All ({readyBots.length}) Tabs</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyAllInvites}
                      disabled={readyBots.length === 0}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs transition disabled:opacity-50"
                    >
                      {copiedLinks ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLinks ? 'Copied 0-Perm Links!' : 'Copy All Links'}</span>
                    </button>
                  </div>

                  {/* Alert: "Integration requires code grant" fix */}
                  <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Fix for &quot;Integration requires code grant&quot;:</span>
                    </div>
                    <p className="text-muted-foreground text-[10px] leading-relaxed">
                      Discord blocks invites if <strong>Requires OAuth2 Code Grant</strong> is enabled. In <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-primary underline font-medium">Discord Developer Portal</a> &rarr; click your bot &rarr; <strong>Bot</strong> tab &rarr; scroll to <strong>Authorization Flow</strong> &rarr; toggle <strong>OFF</strong> &quot;Requires OAuth2 Code Grant&quot; &rarr; <strong>Save Changes</strong>.
                    </p>
                  </div>
                </div>

                {/* Step 2: One-Click Bulk Server Connect & Channel Auto-Sync */}
                <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                  <div className="font-bold text-primary flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                      2
                    </span>
                    <span>Verify &amp; Sync Fleet in Server</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Once authorized in Discord, click below to verify memberships and automatically discover all voice and stage channels.
                  </p>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleBulkVerifyGuild()}
                      disabled={isVerifying || readyBots.length === 0 || !guildIdInput.trim()}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50 shadow-md"
                    >
                      <Users className="w-4 h-4" />
                      <span>{isVerifying ? 'Verifying & Syncing All Bots...' : 'Connect & Sync All Bots to Server'}</span>
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Auto-syncs all authorized bots and links them to your workspace fleet.
                    </p>
                  </div>

                  {/* Bot Interactive Checklist Grid */}
                  <div className="space-y-1 pt-2 border-t border-border/40">
                    <div className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Fleet Authorization Checklist:</span>
                      <span className="text-emerald-400 font-mono">{openedCount}/{readyBots.length} Opened</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {readyBots.map((b, i) => {
                        const isOpened = !!openedBotIds[b.id];
                        return (
                          <div
                            key={b.id}
                            className={`p-2 rounded border flex items-center justify-between text-[11px] transition ${
                              isOpened
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-background/80 hover:bg-secondary border-border/60 text-foreground'
                            }`}
                          >
                            <a
                              href={getBotInviteUrl(b.applicationId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markBotOpened(b.id)}
                              className="truncate flex items-center gap-1.5 flex-1 mr-1"
                              title={`Authorize ${b.displayName} with 0 permissions`}
                            >
                              <Bot className={`w-3.5 h-3.5 shrink-0 ${isOpened ? 'text-emerald-400' : 'text-primary'}`} />
                              <span className="truncate">#{i + 1} {b.displayName}</span>
                            </a>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                                href={`https://discord.com/developers/applications/${b.applicationId}/bot`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition"
                                title="Open in Discord Dev Portal"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                              {isOpened && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bulk Results Table */}
              {bulkResult && (
                <div className="p-3.5 rounded-lg bg-secondary/60 border border-border text-xs space-y-2">
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>Connection Summary for {bulkResult.guildConnection?.displayName || `Server ${guildIdInput}`}:</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {bulkResult.connectedCount || 0} / {bulkResult.totalBots || readyBots.length} Bots Connected
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
                        <span className="text-[10px] text-emerald-400 uppercase font-bold">Active in Server</span>
                      </div>
                    ))}
                    {bulkResult.failedBots?.map((b: any) => (
                      <div
                        key={b.botId}
                        className="p-2 rounded bg-background/60 border border-amber-500/30 flex items-center justify-between gap-2"
                      >
                        <span className="font-medium text-foreground flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{b.displayName}</span>
                        </span>
                        <a
                          href={b.inviteUrl || getBotInviteUrl(b.applicationId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markBotOpened(b.botId)}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] flex items-center gap-1 shrink-0 transition"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Join (0 Perms)</span>
                        </a>
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
                  {bots.map((b, i) => (
                    <option key={b.id} value={b.id}>
                      #{i + 1} {b.displayName} ({b.applicationId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-2">
                <div className="font-bold text-primary flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px]">
                    2
                  </span>
                  <span>Install Bot (0 Permissions)</span>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Join with 0 elevated permissions (like human members, default @everyone).
                </p>
                {selectedBot ? (
                  <a
                    href={getBotInviteUrl(selectedBot.applicationId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Join Server (0 Perms)</span>
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
                  <span>Verify Membership</span>
                </div>
                <p className="text-muted-foreground text-[11px]">Verify bot has joined the Discord server.</p>
                <form onSubmit={handleVerifySingleGuild} className="space-y-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1316627667180851211"
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
                      <button
                        onClick={() => {
                          setGuildIdInput(guild.guildId);
                          setIsWizardOpen(true);
                          setWizardError(null);
                          setWizardSuccess(null);
                        }}
                        className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <span>{totalWorkspaceBots - connectedBotCount} bot(s) not yet synced — Join Now (0 Perms)</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
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

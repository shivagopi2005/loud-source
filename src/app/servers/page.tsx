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
  Trash2,
  ChevronDown,
  ChevronUp,
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

  // Server Deletion & Eviction Modal State
  const [deletingGuild, setDeletingGuild] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingGuild, setIsDeletingGuild] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedBotGuilds, setExpandedBotGuilds] = useState<Record<string, boolean>>({});
  const [expandedChannelGuilds, setExpandedChannelGuilds] = useState<Record<string, boolean>>({});
  const [copiedGuildId, setCopiedGuildId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // Open modal to delete server connection and evict all bots
  const handleOpenDeleteModal = (guild: any) => {
    setDeletingGuild(guild);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const handleCloseDeleteModal = () => {
    if (isDeletingGuild) return;
    setDeletingGuild(null);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  // Execute deletion: instructs all bots to leave the guild and deletes database record
  const handleConfirmDeleteGuild = async () => {
    if (!currentWorkspace || !deletingGuild) return;
    if (deleteConfirmText.trim().toLowerCase() !== 'confirm') {
      setDeleteError('Please type "confirm" to verify server deletion.');
      return;
    }

    setIsDeletingGuild(true);
    setDeleteError(null);

    try {
      const res = await fetch(
        `/api/workspaces/${currentWorkspace.id}/guilds/${deletingGuild.id || deletingGuild.guildId}`,
        {
          method: 'DELETE',
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to remove server and evict bots.');
      }

      setActionNotice({
        type: 'success',
        message: `Server "${deletingGuild.displayName}" was deleted. All ${json.data?.departedBots || 0} bot(s) exited the server.`,
      });
      setDeletingGuild(null);
      setDeleteConfirmText('');
      await loadData();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete server.');
    } finally {
      setIsDeletingGuild(false);
    }
  };

  const handleCopyGuildId = (guildId: string) => {
    navigator.clipboard.writeText(guildId);
    setCopiedGuildId(guildId);
    setTimeout(() => setCopiedGuildId(null), 2000);
  };

  const toggleBotExpand = (guildId: string) => {
    setExpandedBotGuilds((prev) => ({ ...prev, [guildId]: !prev[guildId] }));
  };

  const toggleChannelExpand = (guildId: string) => {
    setExpandedChannelGuilds((prev) => ({ ...prev, [guildId]: !prev[guildId] }));
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

      {/* ACTION NOTICE BANNER */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all shadow-sm ${
            actionNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span className="font-medium">{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-0.5 rounded transition"
          >
            Dismiss
          </button>
        </div>
      )}

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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {guilds.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-card border border-border/80 rounded-2xl shadow-sm text-xs text-muted-foreground flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">No Discord Servers Connected</p>
              <p className="text-muted-foreground mt-1">Connect your bots to a Discord server using the button above.</p>
            </div>
            <button
              onClick={() => {
                setIsWizardOpen(true);
                setWizardError(null);
                setWizardSuccess(null);
                setBulkResult(null);
              }}
              className="mt-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:bg-primary/90 transition"
            >
              Connect Server
            </button>
          </div>
        ) : (
          guilds.map((guild) => {
            const connectedBots = guild.bots || [];
            const connectedBotCount = connectedBots.length;
            const totalWorkspaceBots = bots.length;
            const allBotsConnected = connectedBotCount >= totalWorkspaceBots && totalWorkspaceBots > 0;
            const isBotsExpanded = !!expandedBotGuilds[guild.id];
            const visibleBots = isBotsExpanded ? connectedBots : connectedBots.slice(0, 6);
            const remainingBotsCount = connectedBots.length - 6;

            const channels = guild.channels || [];
            const isChannelsExpanded = !!expandedChannelGuilds[guild.id];
            const visibleChannels = isChannelsExpanded ? channels : channels.slice(0, 6);
            const remainingChannelsCount = channels.length - 6;

            const serverInitials = (guild.displayName || 'Server')
              .split(' ')
              .map((w: string) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();

            return (
              <div
                key={guild.id}
                className="bg-card border border-border/80 hover:border-border rounded-xl p-5 shadow-sm space-y-4 transition flex flex-col justify-between"
              >
                {/* CARD HEADER */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0 select-none">
                      {serverInitials || <Server className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate" title={guild.displayName}>
                        {guild.displayName}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="text-[11px] font-mono text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">
                          {guild.guildId}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyGuildId(guild.guildId)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition"
                          title="Copy Guild ID"
                        >
                          {copiedGuildId === guild.guildId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Badges */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border ${
                        allBotsConnected
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                      }`}
                    >
                      {connectedBotCount}/{totalWorkspaceBots} Bots
                    </span>

                    <button
                      onClick={() => handleQuickSyncAllBots(guild.guildId)}
                      disabled={syncingGuildId === guild.guildId}
                      className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground transition"
                      title="Sync all registered bots into this server"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-primary ${syncingGuildId === guild.guildId ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      onClick={() => handleOpenDeleteModal(guild)}
                      className="p-1.5 rounded-lg bg-secondary hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/30 transition"
                      title="Delete server and evict all bots"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* BOT FLEET MEMBERSHIPS */}
                <div className="text-xs space-y-2 pt-3 border-t border-border/50">
                  <div className="text-muted-foreground font-medium flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Active Bot Fleet ({connectedBotCount})
                    </span>
                    {!allBotsConnected && (
                      <button
                        onClick={() => {
                          setGuildIdInput(guild.guildId);
                          setIsWizardOpen(true);
                          setWizardError(null);
                          setWizardSuccess(null);
                        }}
                        className="text-[11px] text-amber-400 hover:underline flex items-center gap-0.5 font-medium"
                      >
                        <span>Join {totalWorkspaceBots - connectedBotCount} missing</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleBots.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">No bots registered in this server yet.</span>
                    ) : (
                      visibleBots.map((b: any) => (
                        <span
                          key={b.botId}
                          className="inline-flex items-center gap-1.5 text-[11px] bg-secondary/80 border border-border/60 px-2.5 py-1 rounded-md text-foreground font-medium"
                        >
                          <Bot className="w-3 h-3 text-primary" />
                          <span>{b.name}</span>
                        </span>
                      ))
                    )}

                    {connectedBots.length > 6 && (
                      <button
                        type="button"
                        onClick={() => toggleBotExpand(guild.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 border border-primary/20 px-2 py-1 rounded-md transition"
                      >
                        {isBotsExpanded ? (
                          <>
                            <span>Show less</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>+{remainingBotsCount} more</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* DISCOVERED CHANNELS */}
                <div className="text-xs space-y-2 pt-3 border-t border-border/50">
                  <div className="text-muted-foreground font-medium flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Configured Channels ({channels.length})
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleChannels.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground italic">No channels discovered yet. Click Sync to discover.</span>
                    ) : (
                      visibleChannels.map((ch: any) => (
                        <span
                          key={ch.id}
                          className={`text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 border font-medium ${
                            ch.type === 2 || ch.type === 13
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                              : 'bg-secondary/70 text-muted-foreground border-border/50'
                          }`}
                        >
                          {ch.type === 2 || ch.type === 13 ? (
                            <Volume2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Hash className="w-3 h-3 text-primary/70 shrink-0" />
                          )}
                          <span className="truncate max-w-[140px]">{ch.name}</span>
                        </span>
                      ))
                    )}

                    {channels.length > 6 && (
                      <button
                        type="button"
                        onClick={() => toggleChannelExpand(guild.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-secondary/80 border border-border/60 px-2 py-0.5 rounded-md transition"
                      >
                        {isChannelsExpanded ? (
                          <>
                            <span>Show less</span>
                            <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            <span>+{remainingChannelsCount} more</span>
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DELETE SERVER CONFIRMATION MODAL */}
      {deletingGuild && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-destructive/30 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Delete Server &amp; Evict Fleet
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Are you sure you want to remove <span className="text-foreground font-semibold">{deletingGuild.displayName}</span>?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Destructive Action</span>
              </div>
              <p className="leading-relaxed text-destructive/90">
                All <strong>{deletingGuild.bots?.length || 0} active bots</strong> in your workspace fleet will immediately exit (<code className="font-mono bg-destructive/20 px-1 py-0.5 rounded text-[11px]">guild.leave()</code>) this Discord server.
                Channel mappings and permissions will be permanently removed.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground block">
                To confirm deletion, type <span className="font-mono font-bold text-destructive">confirm</span> below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='type confirm to delete the server'
                disabled={isDeletingGuild}
                autoFocus
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border focus:border-destructive focus:ring-1 focus:ring-destructive text-xs font-mono outline-none text-foreground"
              />
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={isDeletingGuild}
                className="px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteGuild}
                disabled={deleteConfirmText.trim().toLowerCase() !== 'confirm' || isDeletingGuild}
                className="px-3.5 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition shadow-sm"
              >
                {isDeletingGuild ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Evicting Fleet...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Server</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

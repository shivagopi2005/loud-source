'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCircle,
  Sparkles,
  Bot,
  Image as ImageIcon,
  Palette,
  Shuffle,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Sliders,
  Upload,
  Info,
  Clock,
  Layers,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  HelpCircle,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { getCachedData, setCachedData } from '@/lib/client-cache';
import { PROFILE_THEMES, PROFILE_PRESETS, ProfilePreset } from '@/server/services/bot-profile-presets';

interface BotProfileItem {
  id: string;
  applicationId: string;
  displayName: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  customStatus?: string | null;
  activityType?: string | null;
  accentColor?: string | null;
  status: string;
  online: boolean;
}

interface UpdateResultItem {
  botId: string;
  displayName: string;
  success: boolean;
  avatarUpdated?: boolean;
  bannerUpdated?: boolean;
  bioUpdated?: boolean;
  statusUpdated?: boolean;
  rateLimited?: boolean;
  avatarRateLimited?: boolean;
  bannerRateLimited?: boolean;
  rateLimitMessage?: string;
  error?: string;
}

export default function BotProfilesPage() {
  const { currentWorkspace } = useWorkspace();

  const [bots, setBots] = useState<BotProfileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [saveResults, setSaveResults] = useState<UpdateResultItem[] | null>(null);

  // Target Scope: 'all' | 'selected' | 'single'
  const [targetScope, setTargetScope] = useState<'all' | 'selected' | 'single'>('all');
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());

  // Granular Apply Options
  const [applyAvatar, setApplyAvatar] = useState(true);
  const [applyBanner, setApplyBanner] = useState(true);
  const [applyBio, setApplyBio] = useState(true);
  const [applyStatus, setApplyStatus] = useState(true);
  const [applyName, setApplyName] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOnline, setFilterOnline] = useState<'all' | 'online'>('all');

  // Form State
  const [displayName, setDisplayName] = useState('AIZEN !!');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bio, setBio] = useState('All of this has been according to my plan since the very beginning.\n\nFrom now on, I will stand atop the heavens.');
  const [customStatus, setCustomStatus] = useState('Standing atop the heavens');
  const [activityType, setActivityType] = useState<'PLAYING' | 'LISTENING' | 'STREAMING' | 'WATCHING' | 'COMPETING' | 'CUSTOM'>('PLAYING');
  const [accentColor, setAccentColor] = useState('#5865f2');

  // Randomize settings
  const [selectedTheme, setSelectedTheme] = useState('all');
  const [uniquePerBot, setUniquePerBot] = useState(true);

  // Active Tab
  const [editorTab, setEditorTab] = useState<'editor' | 'presets'>('editor');

  // Fetch all bots for workspace
  const fetchProfiles = async () => {
    if (!currentWorkspace?.id) return;
    const cacheKey = `workspace:${currentWorkspace.id}:bot_profiles`;
    const cached = getCachedData<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      setBots(cached);
      setIsLoading(false);
      if (!selectedBotId) {
        setSelectedBotId(cached[0].id);
        populateEditor(cached[0]);
      }
    }
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots/profile`);
      const data = await res.json();
      if (res.ok && data.data?.bots) {
        setBots(data.data.bots);
        setCachedData(cacheKey, data.data.bots, 15000);
        if (data.data.bots.length > 0 && !selectedBotId) {
          const first = data.data.bots[0];
          setSelectedBotId(first.id);
          populateEditor(first);
        }
      }
    } catch (err: any) {
      console.error('Failed to load bot profiles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [currentWorkspace?.id]);

  // Populate editor fields when a single bot is selected
  const populateEditor = (bot: BotProfileItem) => {
    setDisplayName(bot.displayName || 'AIZEN !!');
    setAvatarUrl(bot.avatarUrl || '');
    setBannerUrl(bot.bannerUrl || '');
    setBio(bot.bio || '');
    setCustomStatus(bot.customStatus || '');
    setActivityType((bot.activityType as any) || 'PLAYING');
    setAccentColor(bot.accentColor || '#5865f2');
  };

  const handleSelectSingleBot = (botId: string) => {
    setSelectedBotId(botId);
    setTargetScope('single');
    const found = bots.find((b) => b.id === botId);
    if (found) populateEditor(found);
  };

  const toggleSelectBot = (botId: string) => {
    const next = new Set(selectedBotIds);
    if (next.has(botId)) {
      next.delete(botId);
    } else {
      next.add(botId);
    }
    setSelectedBotIds(next);
    if (next.size > 0) {
      setTargetScope('selected');
    }
  };

  const selectAllFiltered = () => {
    const next = new Set(filteredBots.map((b) => b.id));
    setSelectedBotIds(next);
    setTargetScope('selected');
  };

  const clearSelection = () => {
    setSelectedBotIds(new Set());
    setTargetScope('all');
  };

  // Filter bots
  const filteredBots = useMemo(() => {
    return bots.filter((b) => {
      const matchesSearch =
        b.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.applicationId.includes(searchQuery);
      const matchesOnline = filterOnline === 'all' || b.online;
      return matchesSearch && matchesOnline;
    });
  }, [bots, searchQuery, filterOnline]);

  // Load a preset into editor
  const applyPresetToEditor = (preset: ProfilePreset) => {
    setDisplayName(preset.displayName);
    setAvatarUrl(preset.avatarUrl);
    setBannerUrl(preset.bannerUrl);
    setBio(preset.bio);
    setCustomStatus(preset.customStatus);
    setActivityType(preset.activityType);
    setAccentColor(preset.accentColor);
    setStatusMessage({
      type: 'success',
      text: `Loaded "${preset.name}" preset into the editor. Choose which fields to update and click "Apply to Bots".`,
    });
  };

  // Pick a random preset
  const handleRandomizeEditor = () => {
    const pool =
      selectedTheme === 'all'
        ? PROFILE_PRESETS
        : PROFILE_PRESETS.filter((p) => p.theme === selectedTheme);
    const randomIndex = Math.floor(Math.random() * pool.length);
    const preset = pool[randomIndex] || PROFILE_PRESETS[0];
    applyPresetToEditor(preset);
  };

  // Handle image file upload to Base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image file size must be less than 8MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (target === 'avatar') setAvatarUrl(result);
      if (target === 'banner') setBannerUrl(result);
    };
    reader.readAsDataURL(file);
  };

  // Submit profile updates to backend API
  const handleSaveProfiles = async (isRandomBulk: boolean = false) => {
    if (!currentWorkspace?.id) return;
    setIsSaving(true);
    setStatusMessage(null);
    setSaveResults(null);

    const targetBotIds =
      targetScope === 'single'
        ? [selectedBotId]
        : targetScope === 'selected'
        ? Array.from(selectedBotIds)
        : [];

    const payload: any = {
      targetMode: targetScope,
      botIds: targetBotIds,
      applyOptions: {
        updateAvatar: applyAvatar,
        updateBanner: applyBanner,
        updateBio: applyBio,
        updateStatus: applyStatus,
        updateName: applyName,
      },
    };

    if (isRandomBulk) {
      payload.randomize = {
        enabled: true,
        theme: selectedTheme,
        randomizeAvatar: applyAvatar,
        randomizeBanner: applyBanner,
        randomizeBio: applyBio,
        randomizeStatus: applyStatus,
        randomizeName: false,
        uniquePerBot: uniquePerBot,
      };
    } else {
      payload.profileData = {
        displayName,
        avatarUrl,
        bannerUrl,
        bio,
        customStatus,
        activityType,
        accentColor,
      };
    }

    // Optimistic UI updates
    if (!isRandomBulk) {
      setBots((prevBots) =>
        prevBots.map((b) => {
          const isTargeted =
            targetScope === 'all' ||
            (targetScope === 'selected' && targetBotIds.includes(b.id)) ||
            (targetScope === 'single' && b.id === selectedBotId);

          if (!isTargeted) return b;

          return {
            ...b,
            displayName: applyName && displayName ? displayName : b.displayName,
            avatarUrl: applyAvatar && avatarUrl ? avatarUrl : b.avatarUrl,
            bannerUrl: applyBanner && bannerUrl ? bannerUrl : b.bannerUrl,
            bio: applyBio && bio !== undefined ? bio : b.bio,
            customStatus: applyStatus && customStatus !== undefined ? customStatus : b.customStatus,
            activityType: applyStatus && activityType ? activityType : b.activityType,
            accentColor: accentColor || b.accentColor,
          };
        })
      );
    }

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update profiles');
      }

      if (data.data?.results) {
        setSaveResults(data.data.results);
      }

      const rateLimited = (data.data?.rateLimitedCount || 0) > 0;
      if (rateLimited) {
        setStatusMessage({
          type: 'warning',
          text: `Applied bio & status across all ${data.data.updatedCount} bot(s). Note: ${data.data.rateLimitedCount} bot(s) hit Discord's 10-minute avatar/banner limit (Discord allows only 2 image updates per 10 minutes per bot). See report below for details.`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Successfully applied profile changes across ${data.data.updatedCount} bot(s)! Live presence and application profile synchronized.`,
        });
      }

      if (isRandomBulk) {
        await fetchProfiles();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-primary" />
            <span>Bot Profiles &amp; Banners</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage bot avatars, profile banners, bios, and presence status across your Discord fleet.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSaveProfiles(true)}
            disabled={isSaving || bots.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-medium transition disabled:opacity-50"
            title="Apply randomized profile presets across target bots"
          >
            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Randomize Fleet</span>
          </button>

          <button
            onClick={() => handleSaveProfiles(false)}
            disabled={isSaving || bots.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition disabled:opacity-50 shadow-sm"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Applying to Discord...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Apply to Bots</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* DISCORD RATE LIMIT ADVISORY BOX */}
      <div className="p-3.5 rounded-lg bg-card border border-border/80 flex items-start gap-3 text-xs text-muted-foreground">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Why do some bots change and others wait?</span>
            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20">
              Discord API Rule
            </span>
          </div>
          <p className="leading-relaxed">
            Discord strictly enforces a rate limit of <strong>2 avatar changes and 2 banner changes every 10 minutes per bot</strong>.
            If you changed a bot twice recently, Discord temporarily locks that bot&apos;s avatar/banner until the 10-minute cooldown finishes.
            <strong> Bios, Custom Status, and Nicknames have NO cooldown</strong> and update immediately on all bots.
          </p>
        </div>
      </div>

      {/* FEEDBACK STATUS ALERT */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TARGET SCOPE & GRANULAR UPDATE TOGGLES */}
      <div className="p-3 rounded-lg bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-muted-foreground mr-1">Target Mode:</span>

          <button
            onClick={() => setTargetScope('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              targetScope === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>All Bots ({bots.length})</span>
          </button>

          <button
            onClick={() => setTargetScope('selected')}
            className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              targetScope === 'selected'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Selected Bots ({selectedBotIds.size})</span>
          </button>

          <button
            onClick={() => setTargetScope('single')}
            className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
              targetScope === 'single'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Single Bot {selectedBotId ? `(${bots.find(b => b.id === selectedBotId)?.displayName || '1'})` : ''}</span>
          </button>
        </div>

        {/* Granular Field Checkboxes */}
        <div className="flex items-center gap-3 flex-wrap text-muted-foreground border-t md:border-t-0 md:border-l border-border pt-2 md:pt-0 md:pl-3">
          <span className="font-semibold text-foreground text-[11px]">Fields to update:</span>

          <label className="flex items-center gap-1 cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={applyAvatar}
              onChange={(e) => setApplyAvatar(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-3 w-3"
            />
            <span>Avatar</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={applyBanner}
              onChange={(e) => setApplyBanner(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-3 w-3"
            />
            <span>Banner</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={applyBio}
              onChange={(e) => setApplyBio(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-3 w-3"
            />
            <span>Bio</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={applyStatus}
              onChange={(e) => setApplyStatus(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-3 w-3"
            />
            <span>Status</span>
          </label>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKBENCH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: EDITOR & PRESETS (7 COLS) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            {/* TABS HEADER */}
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditorTab('editor')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    editorTab === 'editor'
                      ? 'bg-secondary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Profile Editor</span>
                </button>

                <button
                  onClick={() => setEditorTab('presets')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    editorTab === 'presets'
                      ? 'bg-secondary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Presets</span>
                </button>
              </div>

              <button
                onClick={handleRandomizeEditor}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded bg-primary/10 transition"
              >
                <Shuffle className="w-3 h-3" />
                <span>Quick Randomize</span>
              </button>
            </div>

            {editorTab === 'editor' ? (
              /* CUSTOM FORM EDITOR */
              <div className="space-y-3.5 text-xs">
                {/* 1. Display Name / Nickname */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-foreground">
                      Bot Display Name / Username
                    </label>
                    <span className="text-[11px] text-muted-foreground">Up to 32 characters</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. AIZEN !!"
                      className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => setDisplayName(`Bot #${Math.floor(Math.random() * 900 + 100)}`)}
                      className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                      title="Generate Name"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. Avatar / Profile Picture */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-foreground">
                      Profile Picture (Avatar)
                    </label>
                    <span className="text-[11px] text-muted-foreground">PNG, JPEG, Web URL, or Upload</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://... or data:image/png;base64,..."
                      className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary truncate"
                    />
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-foreground font-medium cursor-pointer shrink-0 transition">
                      <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'avatar')}
                      />
                    </label>
                    <button
                      onClick={() => {
                        const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                        setAvatarUrl(random.avatarUrl);
                      }}
                      className="px-2 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                      title="Random Avatar"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 3. Banner Image / Color */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-foreground">
                      Profile Banner
                    </label>
                    <span className="text-[11px] text-muted-foreground">Hex color (#1e1b4b), Image URL, or Upload</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      placeholder="#5865f2 or https://... or Base64"
                      className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary truncate"
                    />
                    <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-foreground font-medium cursor-pointer shrink-0 transition">
                      <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'banner')}
                      />
                    </label>
                    <button
                      onClick={() => {
                        const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                        setBannerUrl(random.bannerUrl);
                      }}
                      className="px-2 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                      title="Random Banner"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 4. About Me (Bio) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-foreground">
                      About Me (Discord Application Bio)
                    </label>
                    <button
                      onClick={() => {
                        const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                        setBio(random.bio);
                      }}
                      className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
                    >
                      <Shuffle className="w-3 h-3" />
                      <span>Random Bio</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Enter bot description displayed on user profile..."
                    className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
                  />
                </div>

                {/* 5. Custom Status & Activity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Status Message
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customStatus}
                        onChange={(e) => setCustomStatus(e.target.value)}
                        placeholder="e.g. Standing atop the heavens"
                        className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => {
                          const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                          setCustomStatus(random.customStatus);
                          setActivityType(random.activityType);
                        }}
                        className="px-2 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                        title="Random Status"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-foreground block mb-1">
                      Presence Activity Type
                    </label>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="PLAYING">Playing</option>
                      <option value="LISTENING">Listening to</option>
                      <option value="STREAMING">Streaming</option>
                      <option value="WATCHING">Watching</option>
                      <option value="COMPETING">Competing in</option>
                      <option value="CUSTOM">Custom Status</option>
                    </select>
                  </div>
                </div>

                {/* 6. Accent Color */}
                <div>
                  <label className="font-semibold text-foreground block mb-1">
                    Theme Accent Color
                  </label>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-md border border-border shadow-inner shrink-0"
                      style={{ backgroundColor: accentColor }}
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="#5865f2"
                      className="w-28 px-2 py-1 rounded-md bg-secondary border border-border text-foreground font-mono"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['#5865f2', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'].map(
                        (col) => (
                          <button
                            key={col}
                            onClick={() => setAccentColor(col)}
                            className="w-5 h-5 rounded-md border border-white/20 transition hover:scale-105"
                            style={{ backgroundColor: col }}
                            title={col}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* PRESET GALLERY PICKER */
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[440px] overflow-y-auto pr-1">
                  {PROFILE_PRESETS.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => applyPresetToEditor(preset)}
                      className="p-3 rounded-lg border border-border bg-secondary/40 hover:bg-secondary transition cursor-pointer flex flex-col gap-2 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={preset.avatarUrl}
                          alt={preset.name}
                          className="w-9 h-9 rounded-full border border-border shrink-0 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition truncate">
                            {preset.name}
                          </h4>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            {preset.theme}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {preset.bio}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                        <span className="truncate">{preset.customStatus}</span>
                        <span className="text-primary font-semibold shrink-0">Select Preset →</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* APPLICATION RESULTS BREAKDOWN */}
          {saveResults && saveResults.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between font-semibold text-foreground pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span>Discord Sync Report</span>
                  <span className="px-1.5 py-0.2 rounded bg-secondary text-[10px] font-mono">
                    {saveResults.length} bots
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="text-emerald-400">✓ Updated</span>
                  <span className="text-amber-400">⏱️ Cooldown</span>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {saveResults.map((res) => (
                  <div
                    key={res.botId}
                    className="p-2 rounded bg-secondary/40 border border-border/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {res.success ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="font-medium text-foreground truncate">{res.displayName}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] shrink-0 font-medium">
                      {/* Avatar status */}
                      {res.avatarUpdated ? (
                        <span className="text-emerald-400">Avatar ✓</span>
                      ) : res.avatarRateLimited ? (
                        <span className="text-amber-400" title="Discord 10-min avatar cooldown">Avatar ⏱️</span>
                      ) : null}

                      {/* Banner status */}
                      {res.bannerUpdated ? (
                        <span className="text-emerald-400">Banner ✓</span>
                      ) : res.bannerRateLimited ? (
                        <span className="text-amber-400" title="Discord 10-min banner cooldown">Banner ⏱️</span>
                      ) : null}

                      {/* Bio status */}
                      {res.bioUpdated && (
                        <span className="text-emerald-400">Bio ✓</span>
                      )}

                      {/* Status presence */}
                      {res.statusUpdated && (
                        <span className="text-emerald-400">Status ✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DISCORD CLIENT PROFILE PREVIEW & FLEET SELECTOR (5 COLS) */}
        <div className="lg:col-span-5 space-y-4">
          {/* DISCORD PROFILE CARD MOCKUP */}
          <div className="bg-[#111214] border border-[#232428] rounded-xl overflow-hidden shadow-xl text-left select-none">
            {/* Banner */}
            <div
              className="h-24 w-full relative bg-cover bg-center"
              style={{
                backgroundImage:
                  bannerUrl.startsWith('data:') || bannerUrl.startsWith('http')
                    ? `url("${bannerUrl}")`
                    : undefined,
                backgroundColor:
                  !bannerUrl.startsWith('data:') && !bannerUrl.startsWith('http')
                    ? bannerUrl || accentColor || '#1e1b4b'
                    : undefined,
              }}
            >
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white/80 font-mono">
                Discord Preview
              </div>
            </div>

            {/* Profile Content Body */}
            <div className="px-4 pb-4 pt-0 relative bg-[#111214]">
              {/* Overlapping Avatar with Ring */}
              <div className="relative -mt-10 mb-2.5 inline-block">
                <div className="w-16 h-16 rounded-full border-4 border-[#111214] bg-[#1e1f22] overflow-hidden shadow-md relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Bot Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#5865F2]/20 text-[#5865F2]">
                      <Bot className="w-8 h-8" />
                    </div>
                  )}
                </div>
                {/* Online Status Pill */}
                <div
                  className="w-4 h-4 rounded-full bg-[#23a55a] border-4 border-[#111214] absolute bottom-0 right-0"
                  title="Online"
                />
              </div>

              {/* Bot Names and Badge */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    {displayName || 'AIZEN !!'}
                  </h3>
                  <span className="px-1 py-0.2 rounded bg-[#5865F2] text-white text-[9px] font-black uppercase tracking-wider">
                    BOT
                  </span>
                  <span className="text-[11px] text-[#949ba4] font-medium">
                    #0000
                  </span>
                </div>

                {/* Custom Status */}
                {customStatus && (
                  <div className="text-xs text-[#dbdee1] flex items-center gap-1 pt-0.5 font-normal">
                    <span>{customStatus}</span>
                  </div>
                )}
              </div>

              <div className="h-px bg-[#232428] my-3" />

              {/* ABOUT ME SECTION */}
              <div className="space-y-1">
                <h4 className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider">
                  About Me
                </h4>
                <div className="text-xs text-[#dbdee1] leading-relaxed whitespace-pre-line font-sans bg-[#1e1f22] p-2.5 rounded-lg border border-[#2b2d31]">
                  {bio || 'No bio configured yet. Customize in the editor or select a preset.'}
                </div>
              </div>

              {/* FLEET ROLES & STUDIO BADGES */}
              <div className="mt-3 space-y-1">
                <h4 className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider">
                  Roles
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-[#2b2d31] text-[10px] text-[#dbdee1] font-medium border border-white/5">
                    LOUD Studio
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#2b2d31] text-[10px] text-[#dbdee1] font-medium border border-white/5">
                    Voice Operator
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#2b2d31] text-[10px] text-emerald-400 font-medium border border-white/5">
                    Heartbeat Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FLEET BOT SELECTOR */}
          <div className="bg-card border border-border rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Fleet Bots ({bots.length})</h4>
                <p className="text-[11px] text-muted-foreground">Select bots to target for profile updates</p>
              </div>

              <div className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={selectAllFiltered}
                  className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-foreground transition font-medium"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="px-2 py-0.5 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter bots by name or ID..."
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* List of Bots */}
            <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
              {filteredBots.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No bots found.
                </div>
              ) : (
                filteredBots.map((b) => {
                  const isChecked = selectedBotIds.has(b.id);
                  const isSingleSelected = selectedBotId === b.id && targetScope === 'single';

                  return (
                    <div
                      key={b.id}
                      className={`p-2 rounded-md border transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSingleSelected
                          ? 'bg-[#5865F2]/10 border-[#5865F2]'
                          : isChecked
                          ? 'bg-secondary border-[#5865F2]/40'
                          : 'bg-secondary/40 hover:bg-secondary/70 border-border/60'
                      }`}
                      onClick={() => handleSelectSingleBot(b.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Multi-select Checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectBot(b.id);
                          }}
                          className="text-muted-foreground hover:text-primary transition p-0.5"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Bot Thumbnail */}
                        {b.avatarUrl ? (
                          <img
                            src={b.avatarUrl}
                            alt={b.displayName}
                            className="w-6 h-6 rounded-full object-cover shrink-0 border border-border"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center shrink-0 text-xs font-bold">
                            🤖
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
                            <span>{b.displayName}</span>
                            {b.online && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {b.applicationId}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {b.customStatus ? 'Customized' : 'Default'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

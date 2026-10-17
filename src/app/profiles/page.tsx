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
  Trash2,
  Link2,
  FileText,
  Activity,
  Circle,
  Users,
  Type,
  Lock,
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
  canEditProfile?: boolean;
  profileLocked?: boolean;
  profileLockedReason?: string | null;
  isOriginalOwner?: boolean;
  originalOwnerUsername?: string | null;
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
  profileLocked?: boolean;
  profileLockedReason?: string;
}

/**
 * Resizes and compresses an uploaded image file using an off-screen HTML5 canvas.
 * - Discord avatar: max 512x512 px (< 80KB)
 * - Discord banner: max 960x540 px (< 100KB)
 * Prevents large Base64 strings from exceeding edge proxy limits or causing HTTP 500/502 HTML errors.
 */
function compressImageFile(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's an animated GIF under 1MB, preserve frames
    if (file.type === 'image/gif' && file.size < 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const exportType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      try {
        const dataUrl = canvas.toDataURL(exportType, quality);
        resolve(dataUrl);
      } catch {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file. Please ensure it is a valid PNG, JPEG, or GIF.'));
    };

    img.src = objectUrl;
  });
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

  // Active Tab & Filters
  const [editorTab, setEditorTab] = useState<'editor' | 'presets'>('editor');
  const [isAvatarUrlInputOpen, setIsAvatarUrlInputOpen] = useState(false);
  const [isBannerUrlInputOpen, setIsBannerUrlInputOpen] = useState(false);
  const [showRateLimitNotice, setShowRateLimitNotice] = useState(true);
  const [presetThemeFilter, setPresetThemeFilter] = useState('all');

  const filteredPresets = useMemo(() => {
    if (presetThemeFilter === 'all') return PROFILE_PRESETS;
    return PROFILE_PRESETS.filter((p) => p.theme === presetThemeFilter);
  }, [presetThemeFilter]);

  const selectedBot = useMemo(() => bots.find((b) => b.id === selectedBotId), [bots, selectedBotId]);
  const lockedBotsCount = useMemo(() => bots.filter((b) => b.profileLocked).length, [bots]);

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
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.warn('[BotProfiles] Non-JSON response received from profiles GET endpoint, status:', res.status);
        setIsLoading(false);
        return;
      }
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

  // Handle image file upload with off-screen canvas compression
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image file size must be less than 15MB.' });
      return;
    }

    try {
      const maxW = target === 'avatar' ? 512 : 960;
      const maxH = target === 'avatar' ? 512 : 540;
      const compressedDataUrl = await compressImageFile(file, maxW, maxH, 0.85);

      if (target === 'avatar') {
        setAvatarUrl(compressedDataUrl);
        setIsAvatarUrlInputOpen(false);
      }
      if (target === 'banner') {
        setBannerUrl(compressedDataUrl);
        setIsBannerUrlInputOpen(false);
      }
      setStatusMessage({
        type: 'success',
        text: `Image optimized and ready (${target === 'avatar' ? '512x512' : '960x540'}). Click "Apply to Bots" to save.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to process image file.' });
    }
  };

  // Submit profile updates to backend API
  const handleSaveProfiles = async (isRandomBulk: boolean = false) => {
    if (!currentWorkspace?.id) return;

    const targetBotIds =
      targetScope === 'single'
        ? (selectedBotId ? [selectedBotId] : [])
        : targetScope === 'selected'
        ? Array.from(selectedBotIds)
        : [];

    if (targetScope !== 'all' && targetBotIds.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please select at least one bot to update.',
      });
      return;
    }

    if (targetScope === 'single' && (!selectedBotId || !bots.some((b) => b.id === selectedBotId))) {
      setStatusMessage({
        type: 'error',
        text: 'Please select a valid bot from your fleet.',
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setSaveResults(null);

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

      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (res.status === 413) {
          throw new Error('Image size too large for proxy/server. Image was compressed; please re-select or use a smaller image.');
        } else if (res.status === 403) {
          throw new Error('Access denied: You can only modify bots belonging to your own workspace.');
        } else if (res.status >= 500) {
          throw new Error(`Server or proxy returned status ${res.status}. Please check your connection or try again.`);
        } else {
          throw new Error(`Server returned status ${res.status}: ${text.slice(0, 100)}`);
        }
      }

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update profiles');
      }

      if (data.data?.results) {
        setSaveResults(data.data.results);
      }

      if (data.data?.totalTargeted === 0) {
        setStatusMessage({
          type: 'warning',
          text: 'No eligible bots were updated. You can only modify bots belonging to your own workspace.',
        });
        return;
      }

      const lockedCount = data.data?.lockedCount || 0;
      const rateLimited = (data.data?.rateLimitedCount || 0) > 0;
      if (data.data.updatedCount === 0 && lockedCount > 0) {
        setStatusMessage({
          type: 'warning',
          text: `${lockedCount} bot(s) skipped: profile & banner customization is reserved for the original bot owner. Voice streaming, song playback, and commands remain 100% active and unrestricted!`,
        });
      } else if (rateLimited && lockedCount > 0) {
        setStatusMessage({
          type: 'warning',
          text: `Updated ${data.data.updatedCount} bot(s). Note: ${data.data.rateLimitedCount} bot(s) hit Discord cooldown, and ${lockedCount} bot(s) skipped (shared tokens - original owner retains profile customization).`,
        });
      } else if (rateLimited) {
        setStatusMessage({
          type: 'warning',
          text: `Applied bio & status across all ${data.data.updatedCount} bot(s). Note: ${data.data.rateLimitedCount} bot(s) hit Discord's 10-minute avatar/banner limit (Discord allows only 2 image updates per 10 minutes per bot). See report below for details.`,
        });
      } else if (lockedCount > 0) {
        setStatusMessage({
          type: 'success',
          text: `Successfully applied profile updates to ${data.data.updatedCount} bot(s)! Note: ${lockedCount} shared bot(s) skipped (original owner retains profile rights; voice & commands are fully active).`,
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
      setStatusMessage({ type: 'error', text: err.message || 'An unexpected error occurred while updating profiles.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UserCircle className="w-6 h-6 text-primary" />
            <span>Bot Profiles &amp; Banners</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage bot avatars, profile banners, bios, and presence status across your Discord fleet.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSaveProfiles(true)}
            disabled={isSaving || bots.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold transition disabled:opacity-50 shadow-xs"
            title="Apply randomized profile presets across target bots"
          >
            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Randomize Fleet</span>
          </button>

          <button
            onClick={() => handleSaveProfiles(false)}
            disabled={isSaving || bots.length === 0 || (targetScope === 'single' && selectedBot?.profileLocked)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 shadow-md ${
              targetScope === 'single' && selectedBot?.profileLocked
                ? 'bg-amber-600/60 text-white cursor-not-allowed'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Applying to Discord...</span>
              </>
            ) : targetScope === 'single' && selectedBot?.profileLocked ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Profile Locked</span>
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
      {showRateLimitNotice && (
        <div className="p-4 rounded-xl bg-card border border-border/80 shadow-sm flex items-start justify-between gap-3 text-xs text-muted-foreground transition">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Clock className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-xs">Discord Rate Limit Advisory</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-mono border border-amber-500/20 font-medium">
                  API Rule
                </span>
              </div>
              <p className="leading-relaxed">
                Discord strictly enforces a rate limit of <strong>2 avatar changes and 2 banner changes every 10 minutes per bot</strong>.
                If you changed a bot twice recently, Discord temporarily locks that bot&apos;s avatar/banner until the 10-minute cooldown finishes.
                <strong> Bios, Custom Status, and Nicknames have NO cooldown</strong> and update immediately on all bots.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRateLimitNotice(false)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md transition shrink-0"
            title="Dismiss advisory"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* FEEDBACK STATUS ALERT */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2.5 shadow-sm transition ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium leading-relaxed">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-md transition shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TARGET SCOPE & GRANULAR UPDATE TOGGLES */}
      <div className="p-3.5 rounded-xl bg-card border border-border/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        {/* Scope Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            Target Scope:
          </span>

          <div className="flex items-center bg-secondary/80 p-1 rounded-lg border border-border/60">
            <button
              onClick={() => setTargetScope('all')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                targetScope === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All Bots ({bots.length})</span>
            </button>

            <button
              onClick={() => setTargetScope('selected')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                targetScope === 'selected'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Selected ({selectedBotIds.size})</span>
            </button>

            <button
              onClick={() => setTargetScope('single')}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 ${
                targetScope === 'single'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserCircle className="w-3.5 h-3.5" />
              <span className="max-w-[150px] truncate flex items-center gap-1">
                Single {selectedBot ? `(${selectedBot.displayName})` : ''}
                {selectedBot?.profileLocked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
              </span>
            </button>
          </div>
        </div>

        {/* Granular Field Toggle Chips */}
        <div className="flex items-center gap-2 flex-wrap border-t md:border-t-0 md:border-l border-border/60 pt-3 md:pt-0 md:pl-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
            Update Fields:
          </span>

          <button
            type="button"
            onClick={() => setApplyAvatar(!applyAvatar)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              applyAvatar
                ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Avatar</span>
            {applyAvatar && <Check className="w-3 h-3 stroke-[3]" />}
          </button>

          <button
            type="button"
            onClick={() => setApplyBanner(!applyBanner)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              applyBanner
                ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palette className="w-3 h-3" />
            <span>Banner</span>
            {applyBanner && <Check className="w-3 h-3 stroke-[3]" />}
          </button>

          <button
            type="button"
            onClick={() => setApplyBio(!applyBio)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              applyBio
                ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Bio</span>
            {applyBio && <Check className="w-3 h-3 stroke-[3]" />}
          </button>

          <button
            type="button"
            onClick={() => setApplyStatus(!applyStatus)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              applyStatus
                ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Status</span>
            {applyStatus && <Check className="w-3 h-3 stroke-[3]" />}
          </button>

          <button
            type="button"
            onClick={() => setApplyName(!applyName)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              applyName
                ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Type className="w-3 h-3" />
            <span>Name</span>
            {applyName && <Check className="w-3 h-3 stroke-[3]" />}
          </button>
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKBENCH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: EDITOR & PRESETS (7 COLS) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-5">
            {/* TABS HEADER */}
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center bg-secondary/80 p-1 rounded-lg border border-border/60">
                <button
                  onClick={() => setEditorTab('editor')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    editorTab === 'editor'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Profile Editor</span>
                </button>

                <button
                  onClick={() => setEditorTab('presets')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    editorTab === 'presets'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Curated Presets</span>
                </button>
              </div>

              <button
                onClick={handleRandomizeEditor}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/15 border border-primary/20 transition"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Quick Randomize</span>
              </button>
            </div>

            {editorTab === 'editor' ? (
              /* CUSTOM FORM EDITOR */
              <div className="space-y-4 text-xs">
                {/* LOCKED ADVISORY BANNER FOR SHARED / DEVELOPER TOKENS */}
                {targetScope === 'single' && selectedBot?.profileLocked && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-start gap-3 shadow-xs">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground text-xs">Profile Customization Locked (Shared Bot Token)</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-mono border border-amber-500/30 font-semibold">
                          Original Owner Priority
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {selectedBot.profileLockedReason || 'Profile and banner customizations are strictly reserved for the original bot registrant. Voice streaming, song playback (!play / !p), channel spam, and all bot commands remain 100% active and operational!'}
                      </p>
                    </div>
                  </div>
                )}
                {/* 1. Display Name / Nickname */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-primary" />
                      <span>Bot Display Name / Username</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">Up to 32 characters</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      maxLength={32}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. AIZEN !!"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                    />
                    <button
                      onClick={() => setDisplayName(`Bot #${Math.floor(Math.random() * 900 + 100)}`)}
                      className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                      title="Generate Name"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. Avatar / Profile Picture - Visual Media Slot */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-primary" />
                      <span>Profile Picture (Avatar)</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">PNG, JPEG, GIF (Max 8MB)</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl border border-border bg-card overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Avatar Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Bot className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {avatarUrl ? (
                            avatarUrl.startsWith('data:') ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Custom Image Loaded</span>
                              </span>
                            ) : (
                              <span className="truncate block max-w-[200px]" title={avatarUrl}>
                                {avatarUrl}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">Default Bot Avatar</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {avatarUrl ? (
                            avatarUrl.startsWith('data:') ? 'Base64 Encoded • Ready for Discord sync' : 'Remote Web URL'
                          ) : (
                            'Upload a custom image or pick a preset'
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card hover:bg-card/80 border border-border text-foreground font-semibold text-[11px] cursor-pointer shadow-xs transition">
                        <Upload className="w-3 h-3 text-primary" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'avatar')}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setIsAvatarUrlInputOpen(!isAvatarUrlInputOpen)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
                          isAvatarUrlInputOpen
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card hover:bg-card/80 border-border text-foreground'
                        }`}
                        title="Enter image URL"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>URL</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                          setAvatarUrl(random.avatarUrl);
                        }}
                        className="p-1.5 rounded-lg bg-card hover:bg-card/80 border border-border text-muted-foreground hover:text-foreground transition"
                        title="Random Avatar"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </button>

                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="p-1.5 rounded-lg bg-card hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/30 transition"
                          title="Reset to default"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible URL Input Bar */}
                  {isAvatarUrlInputOpen && (
                    <div className="p-2.5 rounded-xl bg-secondary/70 border border-border flex items-center gap-2 animate-in fade-in duration-150">
                      <input
                        type="text"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="Paste image URL (https://...)"
                        className="w-full px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setIsAvatarUrlInputOpen(false)}
                        className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-[11px] font-semibold text-foreground border border-border transition shrink-0"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Banner Image / Color - Visual Media Slot */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-primary" />
                      <span>Profile Banner</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">Image URL, Upload, or Hex (#1e1b4b)</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-16 h-10 rounded-lg border border-border overflow-hidden shrink-0 flex items-center justify-center shadow-inner relative bg-cover bg-center"
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
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {bannerUrl ? (
                            bannerUrl.startsWith('data:') ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Custom Banner Loaded</span>
                              </span>
                            ) : bannerUrl.startsWith('#') ? (
                              <span>Solid Color ({bannerUrl})</span>
                            ) : (
                              <span className="truncate block max-w-[200px]" title={bannerUrl}>
                                {bannerUrl}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">Accent Color Fallback</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {bannerUrl ? (
                            bannerUrl.startsWith('data:') ? 'Base64 Encoded • Ready for Discord sync' : 'Custom banner'
                          ) : (
                            'Custom background image or solid color'
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card hover:bg-card/80 border border-border text-foreground font-semibold text-[11px] cursor-pointer shadow-xs transition">
                        <Upload className="w-3 h-3 text-primary" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/gif"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'banner')}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setIsBannerUrlInputOpen(!isBannerUrlInputOpen)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
                          isBannerUrlInputOpen
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card hover:bg-card/80 border-border text-foreground'
                        }`}
                        title="Enter banner URL or color"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>URL / Color</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                          setBannerUrl(random.bannerUrl);
                        }}
                        className="p-1.5 rounded-lg bg-card hover:bg-card/80 border border-border text-muted-foreground hover:text-foreground transition"
                        title="Random Banner"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </button>

                      {bannerUrl && (
                        <button
                          type="button"
                          onClick={() => setBannerUrl('')}
                          className="p-1.5 rounded-lg bg-card hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border hover:border-destructive/30 transition"
                          title="Reset to default"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Direct URL/Color Input */}
                  {isBannerUrlInputOpen && (
                    <div className="p-2.5 rounded-xl bg-secondary/70 border border-border flex items-center gap-2 animate-in fade-in duration-150">
                      <input
                        type="text"
                        value={bannerUrl}
                        onChange={(e) => setBannerUrl(e.target.value)}
                        placeholder="Paste image URL (https://...) or hex color (#1e1b4b)"
                        className="w-full px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setIsBannerUrlInputOpen(false)}
                        className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-[11px] font-semibold text-foreground border border-border transition shrink-0"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. About Me (Bio) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>About Me (Discord Application Bio)</span>
                    </label>
                    <button
                      onClick={() => {
                        const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                        setBio(random.bio);
                      }}
                      className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-semibold"
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
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-sans focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none text-xs"
                  />
                </div>

                {/* 5. Custom Status & Activity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground block">
                      Status Message
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customStatus}
                        onChange={(e) => setCustomStatus(e.target.value)}
                        placeholder="e.g. Standing atop the heavens"
                        className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary text-xs"
                      />
                      <button
                        onClick={() => {
                          const random = PROFILE_PRESETS[Math.floor(Math.random() * PROFILE_PRESETS.length)];
                          setCustomStatus(random.customStatus);
                          setActivityType(random.activityType);
                        }}
                        className="px-2.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition"
                        title="Random Status"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground block">
                      Presence Activity Type
                    </label>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary text-xs"
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
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground block">
                    Theme Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg border border-border shadow-inner shrink-0 transition"
                      style={{ backgroundColor: accentColor }}
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="#5865f2"
                      className="w-28 px-3 py-1.5 rounded-lg bg-secondary border border-border text-foreground font-mono text-xs"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {['#5865f2', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'].map(
                        (col) => (
                          <button
                            key={col}
                            onClick={() => setAccentColor(col)}
                            className={`w-6 h-6 rounded-md border transition hover:scale-110 ${
                              accentColor.toLowerCase() === col.toLowerCase()
                                ? 'border-white ring-2 ring-primary ring-offset-1'
                                : 'border-white/20'
                            }`}
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
              <div className="space-y-4">
                {/* Theme Filter Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {PROFILE_THEMES.map((th) => (
                    <button
                      key={th.id}
                      onClick={() => setPresetThemeFilter(th.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1.5 border ${
                        presetThemeFilter === th.id
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/60'
                      }`}
                    >
                      <span>{th.name}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[460px] overflow-y-auto pr-1">
                  {filteredPresets.map((preset) => (
                    <div
                      key={preset.id}
                      onClick={() => applyPresetToEditor(preset)}
                      className="p-3.5 rounded-xl border border-border/80 bg-secondary/30 hover:bg-secondary/70 hover:border-border transition-all cursor-pointer flex flex-col justify-between gap-3 group shadow-xs"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={preset.avatarUrl}
                            alt={preset.name}
                            className="w-10 h-10 rounded-xl border border-border/80 shrink-0 object-cover shadow-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition truncate">
                              {preset.name}
                            </h4>
                            <span className="inline-block text-[10px] uppercase font-bold text-muted-foreground tracking-wider bg-secondary px-1.5 py-0.5 rounded border border-border/50 mt-0.5">
                              {preset.theme}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {preset.bio}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 pt-2 font-medium">
                        <span className="truncate max-w-[140px] font-mono text-[10px]">{preset.customStatus}</span>
                        <span className="text-primary group-hover:underline inline-flex items-center gap-0.5 font-semibold text-[11px]">
                          <span>Apply</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* APPLICATION RESULTS BREAKDOWN */}
          {saveResults && saveResults.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-3 shadow-sm">
              <div className="flex items-center justify-between font-semibold text-foreground pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span>Discord Sync Report</span>
                  <span className="px-2 py-0.5 rounded bg-secondary text-[10px] font-mono border border-border/50">
                    {saveResults.length} bots
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-medium">
                  <span className="text-emerald-400">✓ Updated</span>
                  <span className="text-amber-400">⏱️ Cooldown</span>
                  <span className="text-amber-400">🔒 Locked (Shared)</span>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {saveResults.map((res) => (
                  <div
                    key={res.botId}
                    className="p-2.5 rounded-lg bg-secondary/40 border border-border/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {res.profileLocked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : res.success ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="font-semibold text-foreground truncate">{res.displayName}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] shrink-0 font-medium">
                      {res.profileLocked ? (
                        <span className="text-amber-400 font-mono" title={res.profileLockedReason || "Profile update locked to original owner"}>
                          Owner Priority 🔒
                        </span>
                      ) : (
                        <>
                          {res.avatarUpdated ? (
                            <span className="text-emerald-400">Avatar ✓</span>
                          ) : res.avatarRateLimited ? (
                            <span className="text-amber-400" title="Discord 10-min avatar cooldown">Avatar ⏱️</span>
                          ) : null}

                          {res.bannerUpdated ? (
                            <span className="text-emerald-400">Banner ✓</span>
                          ) : res.bannerRateLimited ? (
                            <span className="text-amber-400" title="Discord 10-min banner cooldown">Banner ⏱️</span>
                          ) : null}

                          {res.bioUpdated && (
                            <span className="text-emerald-400">Bio ✓</span>
                          )}

                          {res.statusUpdated && (
                            <span className="text-emerald-400">Status ✓</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DISCORD CLIENT PROFILE PREVIEW & FLEET SELECTOR (5 COLS) */}
        <div className="lg:col-span-5 space-y-5">
          {/* DISCORD PROFILE CARD MOCKUP */}
          <div className="bg-[#111214] border border-[#232428] rounded-2xl overflow-hidden shadow-2xl text-left select-none">
            {/* Banner */}
            <div
              className="h-28 w-full relative bg-cover bg-center"
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
              <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] text-white/90 font-mono border border-white/10 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Discord Preview</span>
              </div>
            </div>

            {/* Profile Content Body */}
            <div className="px-4 pb-4 pt-0 relative bg-[#111214]">
              {/* Overlapping Avatar with Ring */}
              <div className="relative -mt-10 mb-2.5 inline-block">
                <div className="w-18 h-18 rounded-full border-4 border-[#111214] bg-[#1e1f22] overflow-hidden shadow-xl relative flex items-center justify-center">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Bot Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Bot className="w-9 h-9 text-[#5865F2]" />
                  )}
                </div>
                {/* Online Status Pill */}
                <div
                  className="w-5 h-5 rounded-full bg-[#23a55a] border-4 border-[#111214] absolute bottom-0 right-0 shadow-sm"
                  title="Online"
                />
              </div>

              {/* Bot Names and Badge */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {displayName || 'AIZEN !!'}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded bg-[#5865F2] text-white text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    <span>BOT</span>
                  </span>
                  <span className="text-xs text-[#949ba4] font-medium font-mono">
                    #0000
                  </span>
                </div>

                {/* Custom Status with Activity icon */}
                {customStatus && (
                  <div className="text-xs text-[#dbdee1] flex items-center gap-1.5 pt-0.5 font-normal">
                    <Activity className="w-3.5 h-3.5 text-[#949ba4] shrink-0" />
                    <span>
                      {activityType === 'PLAYING' ? 'Playing ' : activityType === 'WATCHING' ? 'Watching ' : activityType === 'LISTENING' ? 'Listening to ' : ''}
                      <strong>{customStatus}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div className="h-px bg-[#232428] my-3.5" />

              {/* ABOUT ME SECTION */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider">
                  About Me
                </h4>
                <div className="text-xs text-[#dbdee1] leading-relaxed whitespace-pre-line font-sans bg-[#1e1f22] p-3 rounded-xl border border-[#2b2d31] shadow-inner">
                  {bio || 'No bio configured yet. Customize in the editor or select a preset.'}
                </div>
              </div>

              {/* FLEET ROLES & STUDIO BADGES */}
              <div className="mt-3.5 space-y-1.5">
                <h4 className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wider">
                  Roles
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-1 rounded-md bg-[#2b2d31] text-[11px] text-[#dbdee1] font-medium border border-white/5 inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#5865F2]" />
                    <span>LOUD Studio</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[#2b2d31] text-[11px] text-[#dbdee1] font-medium border border-white/5 inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    <span>Voice Operator</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[#2b2d31] text-[11px] text-emerald-400 font-medium border border-white/5 inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Heartbeat Active</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FLEET BOT SELECTOR */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground">Fleet Bots Roster ({bots.length})</h4>
                <p className="text-[11px] text-muted-foreground">
                  {lockedBotsCount > 0
                    ? `Select bots to target (${lockedBotsCount} shared bot(s) protected for profile edits)`
                    : 'Select bots to target for profile updates'}
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition font-semibold"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground transition font-medium"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Search Input & Online Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter bots by name or ID..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex bg-secondary p-0.5 rounded-lg border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterOnline('all')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    filterOnline === 'all'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOnline('online')}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                    filterOnline === 'online'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Online
                </button>
              </div>
            </div>

            {/* List of Bots */}
            <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
              {filteredBots.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground bg-secondary/30 rounded-lg">
                  No bots match your search filter.
                </div>
              ) : (
                filteredBots.map((b) => {
                  const isChecked = selectedBotIds.has(b.id);
                  const isSingleSelected = selectedBotId === b.id && targetScope === 'single';

                  return (
                    <div
                      key={b.id}
                      className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                        isSingleSelected
                          ? 'bg-primary/10 border-primary shadow-xs'
                          : isChecked
                          ? 'bg-secondary border-primary/40'
                          : 'bg-secondary/40 hover:bg-secondary/70 border-border/60'
                      }`}
                      onClick={() => handleSelectSingleBot(b.id)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Multi-select Checkbox Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectBot(b.id);
                          }}
                          className="text-muted-foreground hover:text-primary transition p-0.5 shrink-0"
                          title={isChecked ? 'Deselect bot' : 'Select bot'}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>

                        {/* Bot Thumbnail */}
                        <div className="relative shrink-0">
                          {b.avatarUrl ? (
                            <img
                              src={b.avatarUrl}
                              alt={b.displayName}
                              className="w-7 h-7 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs">
                              <Bot className="w-4 h-4" />
                            </div>
                          )}
                          {b.online && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 border border-card absolute -bottom-0.5 -right-0.5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                            <span className="truncate">{b.displayName}</span>
                            {b.profileLocked && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium shrink-0"
                                title={b.profileLockedReason || "Shared bot token: Profile updates reserved for original owner. Voice and commands fully active."}
                              >
                                <Lock className="w-2.5 h-2.5" />
                                <span>Locked</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {b.applicationId}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium ${
                          b.profileLocked
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : b.customStatus
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-secondary text-muted-foreground border-border/60'
                        }`}>
                          {b.profileLocked ? 'Shared Token' : b.customStatus ? 'Customized' : 'Default'}
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

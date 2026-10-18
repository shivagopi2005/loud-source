'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Sliders,
  Volume2,
  VolumeX,
  AlertOctagon,
  Play,
  Square,
  RefreshCw,
  Server,
  Hash,
  Bot,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Users,
  Check,
  Disc,
  Flame,
  Clipboard,
  Wand2,
  Music,
  Headphones,
  ExternalLink,
  FileAudio,
  Pause,
  RotateCcw,
  Sparkles,
  Cast,
  Repeat,
  Trash2,
  SlidersHorizontal,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { getCachedData, setCachedData } from '@/lib/client-cache';

interface VoiceDestination {
  id: string;
  botId: string;
  botName: string;
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
  channelType: number;
}

interface OutputCardState {
  endpointId: string;
  botId: string;
  botName: string;
  channelName: string;
  guildName: string;
  state: 'connecting' | 'connected' | 'muted' | 'reconnecting' | 'failed' | 'disconnected';
  gain: number;
  muted: boolean;
  vuLevel: number;
  lastError?: string;
}

// 10-Band Graphic Studio Equalizer Frequencies & Metadata
const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];
const EQ_BAND_NAMES = ['Sub-Bass', 'Bass', 'Low-Mid', 'Mid', 'Warmth', 'Vocals', 'Presence', 'Clarity', 'Treble', 'Air'];
const EQ_TYPES: BiquadFilterType[] = [
  'lowshelf',
  'peaking',
  'peaking',
  'peaking',
  'peaking',
  'peaking',
  'peaking',
  'peaking',
  'peaking',
  'highshelf',
];

const EQ_PRESETS: Record<string, { name: string; gains: number[]; desc: string }> = {
  ultraLoud: { name: 'Ultra Loud & Clear', gains: [7, 6, 3, 0, -1, 2, 4, 6, 7, 6], desc: 'Maximum punch, vocal clarity & presence' },
  loudness: { name: 'Loudness Contour', gains: [6, 4, 1, -1, -2, -1, 1, 3, 5, 6], desc: 'Full dynamic loudness smile' },
  bassBoost: { name: 'Bass Boost', gains: [9, 8, 6, 2, 0, 0, 0, 0, 1, 2], desc: 'Subwoofer rumble & kick punch' },
  vocalClarity: { name: 'Vocal Clarity', gains: [-4, -2, 0, 1, 3, 5, 6, 5, 3, 1], desc: 'Crisp speech articulation' },
  electronic: { name: 'EDM / Club', gains: [8, 7, 4, 0, -1, 1, 3, 5, 7, 8], desc: 'Deep bass & sparkling highs' },
  rock: { name: 'Rock / Metal', gains: [5, 4, 2, -1, -2, 0, 3, 5, 4, 3], desc: 'Punchy low-end & guitar bite' },
  trebleBoost: { name: 'Treble Boost', gains: [-2, -1, 0, 0, 1, 2, 4, 6, 8, 9], desc: 'Bright acoustic shimmer' },
  flat: { name: 'Flat (0 dB)', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], desc: '100% Studio Pure Original' },
};

export default function LiveVoiceStudioPage() {
  const { currentWorkspace, triggerEmergencyStop, activeVoiceSession, setActiveVoiceSession } =
    useWorkspace();

  // Audio routing mode ('dj' = mic + music mixed, 'music' = Spotify/YouTube only, 'mic' = voice only)
  const [audioSourceMode, setAudioSourceMode] = useState<'dj' | 'music' | 'mic'>('dj');
  const [activeDeckTab, setActiveDeckTab] = useState<'music' | 'file' | 'mic'>('music');

  // Microphone hardware & processing state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [inputGain, setInputGain] = useState<number>(1.0);
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [highPassFilter, setHighPassFilter] = useState<boolean>(true);
  const [compressorEnabled, setCompressorEnabled] = useState<boolean>(true);
  const [previewAudio, setPreviewAudio] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [inputVuLevel, setInputVuLevel] = useState<number>(0);

  // Music / Spotify / YouTube Music Bridge state
  const [isMusicConnected, setIsMusicConnected] = useState<boolean>(false);
  const [musicSourceName, setMusicSourceName] = useState<string>('');
  const [musicGain, setMusicGain] = useState<number>(1.0);
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(false);
  const [musicVuLevel, setMusicVuLevel] = useState<number>(0);
  const [musicError, setMusicError] = useState<string | null>(null);

  // Local MP3 / Audio File Player state (In-Memory Web Audio - 100% Muted in Browser, Direct to Bots)
  const [isPlayingFile, setIsPlayingFile] = useState<boolean>(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState<number>(0);
  const [fileCurrentTime, setFileCurrentTime] = useState<number>(0);
  const [isFileLooping, setIsFileLooping] = useState<boolean>(true);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [isPlayingTestChime, setIsPlayingTestChime] = useState<boolean>(false);

  // 10-Band Studio Equalizer state (Shapes audio directly sent to all Discord bots)
  const [isEqEnabled, setIsEqEnabled] = useState<boolean>(true);
  const [eqGains, setEqGains] = useState<number[]>([7, 6, 3, 0, -1, 2, 4, 6, 7, 6]);
  const [activeEqPreset, setActiveEqPreset] = useState<string>('ultraLoud');
  const [isEqExpanded, setIsEqExpanded] = useState<boolean>(true);

  // Raw fetched data
  const [guildsList, setGuildsList] = useState<any[]>([]);
  const [botsList, setBotsList] = useState<any[]>([]);

  // Fleet Channel Connector Panel state
  const [routingMode, setRoutingMode] = useState<'fleet' | 'custom'>('fleet');
  const [selectedFleetGuildId, setSelectedFleetGuildId] = useState<string>('');
  const [manualGuildId, setManualGuildId] = useState<string>('');
  const [guildInputMode, setGuildInputMode] = useState<'dropdown' | 'manual'>('manual');
  const [selectedFleetChannelId, setSelectedFleetChannelId] = useState<string>('');
  const [manualChannelId, setManualChannelId] = useState<string>('');
  const [channelInputMode, setChannelInputMode] = useState<'dropdown' | 'manual'>('manual');
  const [selectedFleetBotIds, setSelectedFleetBotIds] = useState<string[]>([]);
  const [isDetectingChannels, setIsDetectingChannels] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  // Custom matrix destinations
  const [availableDestinations, setAvailableDestinations] = useState<VoiceDestination[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);

  // Session state (Default Master Gain set to 1.0 = 100% Studio Original Fidelity)
  const [sessionState, setSessionState] = useState<
    'idle' | 'awaiting_start' | 'connecting' | 'streaming' | 'stopping' | 'stopped'
  >('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [outputCards, setOutputCards] = useState<OutputCardState[]>([]);
  const [masterGain, setMasterGain] = useState<number>(1.0); // 100% Studio Original default
  const [masterMuted, setMasterMuted] = useState<boolean>(false);
  const [sessionDurationSec, setSessionDurationSec] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(24);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio Context and Stream References
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  // Music Bridge Stream & Graph References
  const musicStreamRef = useRef<MediaStream | null>(null);
  const musicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const musicAnalyserRef = useRef<AnalyserNode | null>(null);

  // Master Studio Mixer References
  const masterMixerRef = useRef<GainNode | null>(null);
  const masterCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const masterAnalyserRef = useRef<AnalyserNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Equalizer Node References
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const eqOutputRef = useRef<GainNode | null>(null);
  const eqGainsRef = useRef<number[]>([7, 6, 3, 0, -1, 2, 4, 6, 7, 6]);
  const isEqEnabledRef = useRef<boolean>(true);

  // File Player References (Web Audio in-memory buffer - 100% muted in browser speakers, streamed directly to bots)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fileGainNodeRef = useRef<GainNode | null>(null);
  const filePlaybackStartedAtRef = useRef<number>(0);
  const filePausedOffsetRef = useRef<number>(0);
  const fileCurrentTimeRef = useRef<number>(0);
  const fileTimeUpdateTimerRef = useRef<any>(null);
  const isFileLoopingRef = useRef<boolean>(true);
  const testChimeIntervalRef = useRef<any>(null);

  // Synced numerical refs for high-frequency audio callbacks
  const masterGainRef = useRef<number>(1.0);
  const musicGainRef = useRef<number>(1.0);
  const inputGainRef = useRef<number>(1.0);
  const isMicMutedRef = useRef<boolean>(false);
  const isMusicMutedRef = useRef<boolean>(false);
  const audioSourceModeRef = useRef<'dj' | 'music' | 'mic'>('dj');
  const masterMutedRef = useRef<boolean>(false);
  const previewAudioRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);

  useEffect(() => {
    masterGainRef.current = masterGain;
  }, [masterGain]);

  useEffect(() => {
    musicGainRef.current = musicGain;
  }, [musicGain]);

  useEffect(() => {
    inputGainRef.current = inputGain;
  }, [inputGain]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    isMusicMutedRef.current = isMusicMuted;
  }, [isMusicMuted]);

  useEffect(() => {
    audioSourceModeRef.current = audioSourceMode;
  }, [audioSourceMode]);

  useEffect(() => {
    masterMutedRef.current = masterMuted;
  }, [masterMuted]);

  useEffect(() => {
    previewAudioRef.current = previewAudio;
  }, [previewAudio]);

  useEffect(() => {
    eqGainsRef.current = eqGains;
  }, [eqGains]);

  useEffect(() => {
    isEqEnabledRef.current = isEqEnabled;
  }, [isEqEnabled]);

  // Load microphones
  useEffect(() => {
    async function getDevices() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((d) => d.kind === 'audioinput');
          setAudioDevices(audioInputs);
          if (audioInputs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(audioInputs[0].deviceId);
          }
        }
      } catch (err) {
        console.warn('Could not enumerate audio devices:', err);
      }
    }
    getDevices();
  }, []);

  // Load available voice channels and bots for workspace
  const loadDestinations = async () => {
    if (!currentWorkspace) return;

    const cacheKeyGuilds = `workspace:${currentWorkspace.id}:guilds`;
    const cacheKeyBots = `workspace:${currentWorkspace.id}:bots`;

    const cachedGuilds = getCachedData<any[]>(cacheKeyGuilds);
    const cachedBots = getCachedData<any[]>(cacheKeyBots);
    const isExcludedVoiceBot = (b: any) =>
      b.operationalRole === 'oauth_redirect' ||
      b.applicationId === '1560261747137454161' ||
      b.displayName === 'Roynix Loud' ||
      b.displayName === 'Integration Test Bot' ||
      b.tags?.includes('oauth') ||
      b.tags?.includes('redirect');

    if (cachedGuilds && cachedGuilds.length > 0) {
      setGuildsList(cachedGuilds);
    }
    if (cachedBots && cachedBots.length > 0) {
      const readyCachedBots = cachedBots.filter(
        (b: any) =>
          (b.status === 'ready' || b.status === 'connected' || b.online) &&
          !isExcludedVoiceBot(b)
      );
      setBotsList(readyCachedBots);
      if (selectedFleetBotIds.length === 0 && readyCachedBots.length > 0) {
        setSelectedFleetBotIds(readyCachedBots.map((b: any) => b.id));
      }
    }

    try {
      const [guildsRes, botsRes] = await Promise.all([
        fetch(`/api/workspaces/${currentWorkspace.id}/guilds`),
        fetch(`/api/workspaces/${currentWorkspace.id}/bots`),
      ]);

      if (guildsRes.ok && botsRes.ok) {
        const guildsData = await guildsRes.json();
        const botsData = await botsRes.json();

        const guilds = guildsData.data || [];
        const rawBots = botsData.data || [];
        const readyBots = rawBots.filter(
          (b: any) =>
            (b.status === 'ready' || b.status === 'connected' || b.online) &&
            !isExcludedVoiceBot(b)
        );

        setGuildsList(guilds);
        setBotsList(readyBots);
        setCachedData(cacheKeyGuilds, guilds, 15000);
        setCachedData(cacheKeyBots, rawBots, 15000);

        // Auto-select guild for fleet mode (prefer WILD SECTOR if available)
        if (guilds.length > 0) {
          const wildSector = guilds.find(
            (g: any) => g.guildId === '1499406517470756955' || g.displayName?.includes('WILD')
          );
          const targetGuild =
            wildSector ||
            guilds.find((g: any) => g.id === selectedFleetGuildId || g.guildId === selectedFleetGuildId) ||
            guilds[0];
          const guildIdToUse = targetGuild.guildId || targetGuild.id;
          setSelectedFleetGuildId(guildIdToUse);
          setManualGuildId((prev) => prev || guildIdToUse);

          const voiceChannels = (targetGuild.channels || []).filter(
            (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
          );

          if (voiceChannels.length > 0) {
            const preferredChannel =
              voiceChannels.find(
                (c: any) =>
                  c.channelId === '1499406518313947284' ||
                  c.id === '1499406518313947284' ||
                  c.displayName?.includes('ᴘᴜʙʟɪᴄ ¹') ||
                  c.name?.includes('ᴘᴜʙʟɪᴄ ¹')
              ) || voiceChannels[0];
            const channelIdToUse = preferredChannel.channelId || preferredChannel.id;
            setSelectedFleetChannelId(channelIdToUse);
            setManualChannelId((prev) => prev || channelIdToUse);
          }
        } else {
          setGuildInputMode('manual');
          setChannelInputMode('manual');
        }

        // Auto-select ALL ready bots for the fleet
        if (readyBots.length > 0 && selectedFleetBotIds.length === 0) {
          setSelectedFleetBotIds(readyBots.map((b: any) => b.id));
        }

        // Build flat matrix destinations
        const destinations: VoiceDestination[] = [];
        for (const guild of guilds) {
          const voiceChannels = (guild.channels || []).filter(
            (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
          );

          for (const ch of voiceChannels) {
            for (const bot of readyBots) {
              destinations.push({
                id: `${bot.id}_${ch.channelId || ch.id}`,
                botId: bot.id,
                botName: bot.displayName,
                guildId: guild.guildId || guild.id,
                guildName: guild.displayName,
                channelId: ch.channelId || ch.id,
                channelName: ch.name,
                channelType: ch.type,
              });
            }
          }
        }

        setAvailableDestinations(destinations);
        if (destinations.length > 0 && selectedDestinationIds.length === 0) {
          setSelectedDestinationIds([destinations[0].id]);
        }
      }
    } catch (err) {
      console.error('Failed to load destinations:', err);
    }
  };

  useEffect(() => {
    loadDestinations();
  }, [currentWorkspace]);

  // When fleet guild changes, update channel options
  const handleFleetGuildChange = (guildIdOrUuid: string) => {
    const targetGuild = guildsList.find(
      (g) => g.id === guildIdOrUuid || g.guildId === guildIdOrUuid
    );
    const resolvedGuildId = targetGuild?.guildId || targetGuild?.id || guildIdOrUuid;
    setSelectedFleetGuildId(resolvedGuildId);
    setManualGuildId(resolvedGuildId);
    if (targetGuild) {
      const voiceChannels = (targetGuild.channels || []).filter(
        (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
      );
      if (voiceChannels.length > 0) {
        const preferredCh = voiceChannels[0].channelId || voiceChannels[0].id;
        setSelectedFleetChannelId(preferredCh);
        setManualChannelId(preferredCh);
      } else {
        setSelectedFleetChannelId('');
        setManualChannelId('');
        setChannelInputMode('manual');
      }
    }
  };

  // Paste Guild / Server ID from clipboard
  const handlePasteGuildId = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.trim();
      if (cleaned) {
        setManualGuildId(cleaned);
        setGuildInputMode('manual');
      }
    } catch {
      // Clipboard access denied or unavailable
    }
  };

  // Auto-detect server voice channels
  const handleAutoDetectChannels = async () => {
    const rawGuildId =
      guildInputMode === 'manual' || guildsList.length === 0
        ? manualGuildId.trim()
        : selectedFleetGuildId || manualGuildId.trim();

    if (!currentWorkspace || !rawGuildId) {
      setDetectMsg('Please specify a Discord Server / Guild ID first');
      return;
    }
    setIsDetectingChannels(true);
    setDetectMsg(null);
    try {
      const targetGuild = guildsList.find(
        (g) => g.id === rawGuildId || g.guildId === rawGuildId
      );
      const targetGuildId = targetGuild?.guildId || rawGuildId;

      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/guilds/bulk-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: targetGuildId,
          autoSyncChannels: true,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setDetectMsg(`Discovered ${json.data?.discoveredChannels || 0} voice channels!`);
        await loadDestinations();
        setChannelInputMode('dropdown');
      } else {
        setDetectMsg(`Notice: ${json.error?.message || 'Please enter Voice Channel ID manually'}`);
        setChannelInputMode('manual');
      }
    } catch (err: any) {
      setDetectMsg(`Notice: Please enter Voice Channel ID manually`);
      setChannelInputMode('manual');
    } finally {
      setIsDetectingChannels(false);
      setTimeout(() => setDetectMsg(null), 4000);
    }
  };

  // Paste channel ID from clipboard
  const handlePasteChannelId = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.trim();
      if (cleaned) {
        setManualChannelId(cleaned);
      }
    } catch {
      // Clipboard access denied or unavailable
    }
  };

  // Toggle bot selection in fleet panel
  const toggleFleetBot = (botId: string) => {
    if (sessionState === 'streaming') return;
    setSelectedFleetBotIds((prev) =>
      prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId]
    );
  };

  const handleSelectAllFleetBots = () => {
    if (sessionState === 'streaming') return;
    setSelectedFleetBotIds(botsList.map((b) => b.id));
  };

  const handleDeselectAllFleetBots = () => {
    if (sessionState === 'streaming') return;
    setSelectedFleetBotIds([]);
  };

  // Set unified volume for ALL bots simultaneously (supports up to 10000% volume)
  const handleSetUnifiedGain = (newGain: number) => {
    const clamped = Math.max(0, Math.min(100.0, newGain));
    setMasterGain(clamped);
    masterGainRef.current = clamped;

    // Apply to all output cards so every bot works at the exact same volume
    setOutputCards((prev) => prev.map((c) => ({ ...c, gain: clamped })));

    // Send SET_MASTER_GAIN to MediaGateway to sync all Discord bot players
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_MASTER_GAIN', gain: clamped }));
    }
  };

  // 10-Band Equalizer: Change gain for a specific band (-12dB to +12dB)
  const handleEqBandChange = (index: number, newGainDb: number) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(newGainDb * 10) / 10));
    setEqGains((prev) => {
      const next = [...prev];
      next[index] = clamped;
      return next;
    });
    setActiveEqPreset('custom');

    const ctx = audioContextRef.current;
    if (ctx && eqFiltersRef.current[index] && isEqEnabledRef.current) {
      try {
        eqFiltersRef.current[index].gain.setValueAtTime(clamped, ctx.currentTime);
      } catch {}
    }
  };

  // 10-Band Equalizer: Apply preset profile
  const handleApplyEqPreset = (presetKey: string) => {
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;

    setActiveEqPreset(presetKey);
    setEqGains([...preset.gains]);
    eqGainsRef.current = [...preset.gains];

    const ctx = audioContextRef.current;
    if (ctx && eqFiltersRef.current.length === 10) {
      for (let i = 0; i < 10; i++) {
        const targetGain = isEqEnabledRef.current ? preset.gains[i] : 0;
        try {
          eqFiltersRef.current[i].gain.setValueAtTime(targetGain, ctx.currentTime);
        } catch {}
      }
    }
  };

  // 10-Band Equalizer: Toggle bypass
  const handleToggleEq = () => {
    const next = !isEqEnabled;
    setIsEqEnabled(next);
    isEqEnabledRef.current = next;

    const ctx = audioContextRef.current;
    if (ctx && eqFiltersRef.current.length === 10) {
      for (let i = 0; i < 10; i++) {
        const targetGain = next ? eqGainsRef.current[i] : 0;
        try {
          eqFiltersRef.current[i].gain.setValueAtTime(targetGain, ctx.currentTime);
        } catch {}
      }
    }
  };

  // 10-Band Equalizer: Reset all bands to Flat (0 dB)
  const handleResetEq = () => {
    handleApplyEqPreset('flat');
  };

  // Duration counter during streaming
  useEffect(() => {
    let timer: any = null;
    if (sessionState === 'streaming') {
      timer = setInterval(() => {
        setSessionDurationSec((prev) => prev + 1);
      }, 1000);
    } else {
      setSessionDurationSec(0);
    }
    return () => clearInterval(timer);
  }, [sessionState]);

  // Effective guild ID: manual input or dropdown selection
  const effectiveGuildId =
    guildInputMode === 'manual' || guildsList.length === 0
      ? manualGuildId.trim()
      : selectedFleetGuildId || manualGuildId.trim();

  // Current active guild and channels for Fleet mode
  const currentFleetGuild = guildsList.find(
    (g) => g.id === effectiveGuildId || g.guildId === effectiveGuildId
  );
  const currentFleetVoiceChannels = (currentFleetGuild?.channels || []).filter(
    (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
  );
  const currentFleetChannel = currentFleetVoiceChannels.find(
    (c: any) => c.id === selectedFleetChannelId || c.channelId === selectedFleetChannelId
  );

  // Effective channel ID: manual input or dropdown selection
  const effectiveChannelId =
    channelInputMode === 'manual' || currentFleetVoiceChannels.length === 0
      ? manualChannelId.trim()
      : selectedFleetChannelId || manualChannelId.trim();

  // Effective channel display name
  const effectiveChannelDisplayName =
    channelInputMode === 'manual' || currentFleetVoiceChannels.length === 0
      ? manualChannelId.trim()
        ? `Voice Channel #${manualChannelId.trim()}`
        : 'Manual Channel ID'
      : currentFleetChannel?.name
      ? `#${currentFleetChannel.name}`
      : `Voice Channel #${effectiveChannelId}`;

  // Initialize or retrieve unified Web Audio Context
  const getOrCreateAudioContext = (): AudioContext => {
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioCtx({ sampleRate: 48000 });
      audioContextRef.current = ctx;

      const masterMixer = ctx.createGain();
      masterMixer.gain.value = 1.0;
      masterMixerRef.current = masterMixer;

      // 10-Band Graphic Studio Equalizer Chain (Shapes audio directly sent to all Discord bots)
      const filters: BiquadFilterNode[] = [];
      let previousNode: AudioNode = masterMixer;

      for (let i = 0; i < EQ_FREQUENCIES.length; i++) {
        const filter = ctx.createBiquadFilter();
        filter.type = EQ_TYPES[i];
        filter.frequency.value = EQ_FREQUENCIES[i];
        filter.gain.value = isEqEnabledRef.current ? eqGainsRef.current[i] || 0 : 0;
        if (filter.type === 'peaking') {
          filter.Q.value = 1.4;
        }
        previousNode.connect(filter);
        previousNode = filter;
        filters.push(filter);
      }
      eqFiltersRef.current = filters;

      const eqOutput = ctx.createGain();
      eqOutput.gain.value = 1.0;
      previousNode.connect(eqOutput);
      eqOutputRef.current = eqOutput;

      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 256;
      masterAnalyserRef.current = masterAnalyser;

      // Equalized output connects directly to master analyser
      eqOutput.connect(masterAnalyser);

      if (previewAudio) {
        eqOutput.connect(ctx.destination);
      }
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.warn);
    }

    return ctx;
  };

  // Preview audio monitor effect
  useEffect(() => {
    const outputNode = eqOutputRef.current || masterMixerRef.current;
    if (outputNode && audioContextRef.current) {
      try {
        if (previewAudio) {
          outputNode.connect(audioContextRef.current.destination);
        } else {
          outputNode.disconnect(audioContextRef.current.destination);
        }
      } catch {}
    }
  }, [previewAudio]);

  // Setup ScriptProcessor for streaming mixed 48kHz PCM frames over WebSocket
  const setupScriptProcessor = (ctx: AudioContext) => {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.warn);
    }

    if (scriptProcessorRef.current) {
      try {
        const outputNode = eqOutputRef.current || masterMixerRef.current;
        if (outputNode) {
          outputNode.connect(scriptProcessorRef.current);
        }
      } catch {}
      return;
    }

    const bufferSize = 2048;
    const scriptProcessor = ctx.createScriptProcessor(bufferSize, 2, 2);
    scriptProcessorRef.current = scriptProcessor;

    // Connect ONLY equalized output into scriptProcessor (strictly 1 path - zero comb-filtering or resound)
    const outputNode = eqOutputRef.current || masterMixerRef.current;
    if (outputNode) {
      outputNode.connect(scriptProcessor);
    }
    scriptProcessor.connect(ctx.destination);

    let sentCount = 0;
    scriptProcessor.onaudioprocess = (e) => {
      const inputChannelL = e.inputBuffer.getChannelData(0);
      const inputChannelR =
        e.inputBuffer.numberOfChannels > 1
          ? e.inputBuffer.getChannelData(1)
          : inputChannelL;

      // Handle output buffer so Chromium's audio rendering engine keeps ticking
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.numberOfChannels > 1 ? e.outputBuffer.getChannelData(1) : outL;
      if (previewAudioRef.current) {
        outL.set(inputChannelL);
        outR.set(inputChannelR);
      } else {
        outL.fill(0);
        outR.fill(0);
      }

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && !masterMutedRef.current) {
        const pcm16 = new Int16Array(inputChannelL.length * 2);
        let peakVal = 0;

        for (let i = 0; i < inputChannelL.length; i++) {
          const sL = inputChannelL[i];
          const sR = inputChannelR[i];

          // Clamp within standard audio range [-1.0, 1.0]
          const clampedL = Math.max(-1.0, Math.min(1.0, sL));
          const clampedR = Math.max(-1.0, Math.min(1.0, sR));

          const absL = Math.abs(clampedL);
          const absR = Math.abs(clampedR);
          if (absL > peakVal) peakVal = absL;
          if (absR > peakVal) peakVal = absR;

          // Convert to 16-bit linear PCM with proper rounding (100% studio fidelity)
          pcm16[i * 2] = clampedL < 0 ? Math.max(-32768, Math.round(clampedL * 32768)) : Math.min(32767, Math.round(clampedL * 32767));
          pcm16[i * 2 + 1] = clampedR < 0 ? Math.max(-32768, Math.round(clampedR * 32768)) : Math.min(32767, Math.round(clampedR * 32767));
        }
        // Explicit TypedArray view guarantees WebSocket sends a binary frame (opcode 0x2) across all browsers & reverse proxies
        ws.send(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength));

        sentCount++;
        if (sentCount % 100 === 1) {
          console.log(`[VoiceStudio] Streaming PCM chunk #${sentCount} (peak: ${Math.round(peakVal * 100)}%)`);
        }
      }
    };
  };

  // Connect to Browser Tab or System Audio (Spotify, YouTube Music, YouTube, etc.)
  const handleConnectMusicCapture = async () => {
    try {
      setMusicError(null);
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
        video: true,
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        setMusicError(
          "No audio track detected! When prompted, please select 'Chrome Tab' (e.g. YouTube Music or Spotify) and make sure the 'Also share tab audio' checkbox is ENABLED."
        );
        return;
      }

      // Keep video tracks alive but disabled (in Chromium, calling stop() on video immediately terminates the entire getDisplayMedia session, killing audio!)
      displayStream.getVideoTracks().forEach((vt) => {
        vt.enabled = false;
      });

      const audioTrack = audioTracks[0];
      const trackLabel = audioTrack.label || 'System / Tab Audio';
      let detectedName = trackLabel;
      const lower = trackLabel.toLowerCase();
      if (lower.includes('youtube') || lower.includes('yt')) {
        detectedName = 'YouTube / YouTube Music';
      } else if (lower.includes('spotify')) {
        detectedName = 'Spotify Music Player';
      } else if (lower.includes('soundcloud')) {
        detectedName = 'SoundCloud Stream';
      } else {
        detectedName = `Tab Audio (${trackLabel.slice(0, 24)})`;
      }

      setMusicSourceName(detectedName);
      musicStreamRef.current = displayStream;
      setIsMusicConnected(true);

      const ctx = getOrCreateAudioContext();
      const musicAudioStream = new MediaStream([audioTrack]);
      const musicSource = ctx.createMediaStreamSource(musicAudioStream);
      musicSourceRef.current = musicSource;

      const musicGainNode = ctx.createGain();
      const initialMusicGain =
        isMusicMuted || audioSourceModeRef.current === 'mic' ? 0 : Math.max(1.5, musicGainRef.current);
      musicGainNode.gain.value = initialMusicGain;
      musicGainNodeRef.current = musicGainNode;

      const musicAnalyser = ctx.createAnalyser();
      musicAnalyser.fftSize = 256;
      musicAnalyserRef.current = musicAnalyser;

      musicSource.connect(musicGainNode);
      musicGainNode.connect(musicAnalyser);

      if (masterMixerRef.current) {
        musicGainNode.connect(masterMixerRef.current);
      }

      // If active session is streaming, ensure script processor is running
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setupScriptProcessor(ctx);
      }

      // Live Music VU Meter Loop
      const pcmData = new Uint8Array(musicAnalyser.frequencyBinCount);
      const updateMusicMeter = () => {
        if (musicAnalyserRef.current && musicStreamRef.current) {
          musicAnalyserRef.current.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sum += pcmData[i];
          }
          const avg = sum / pcmData.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setMusicVuLevel(level);
          requestAnimationFrame(updateMusicMeter);
        } else {
          setMusicVuLevel(0);
        }
      };
      requestAnimationFrame(updateMusicMeter);

      // Clean up when user stops sharing via browser bar
      audioTrack.onended = () => {
        handleDisconnectMusicCapture();
      };
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('Music capture error:', err);
        setMusicError(err.message || 'Failed to capture music audio');
      }
    }
  };

  // Disconnect Music Audio Capture
  const handleDisconnectMusicCapture = () => {
    if (musicStreamRef.current) {
      musicStreamRef.current.getTracks().forEach((t) => t.stop());
      musicStreamRef.current = null;
    }
    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.disconnect();
      } catch {}
      musicSourceRef.current = null;
    }
    setIsMusicConnected(false);
    setMusicSourceName('');
    setMusicVuLevel(0);
  };

  // Set Music Volume (Supports up to 10000% volume)
  const handleSetMusicGain = (newGain: number) => {
    const clamped = Math.max(0, Math.min(100.0, newGain));
    setMusicGain(clamped);
    musicGainRef.current = clamped;
    const effectiveGain = isMusicMuted || audioSourceModeRef.current === 'mic' ? 0 : clamped;
    if (musicGainNodeRef.current) {
      musicGainNodeRef.current.gain.value = effectiveGain;
    }
    if (fileGainNodeRef.current) {
      fileGainNodeRef.current.gain.value = effectiveGain;
    }
  };

  // Toggle Music Mute
  const toggleMusicMute = () => {
    const next = !isMusicMuted;
    setIsMusicMuted(next);
    isMusicMutedRef.current = next;
    const effectiveGain = next || audioSourceModeRef.current === 'mic' ? 0 : musicGainRef.current;
    if (musicGainNodeRef.current) {
      musicGainNodeRef.current.gain.value = effectiveGain;
    }
    if (fileGainNodeRef.current) {
      fileGainNodeRef.current.gain.value = effectiveGain;
    }
  };

  // Toggle Mic Mute
  const toggleMicMute = () => {
    const next = !isMicMuted;
    setIsMicMuted(next);
    isMicMutedRef.current = next;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value =
        next || audioSourceModeRef.current === 'music' ? 0 : inputGainRef.current;
    }
  };

  // Switch Audio Source Mode ('dj' | 'music' | 'mic')
  const handleAudioSourceModeChange = (mode: 'dj' | 'music' | 'mic') => {
    setAudioSourceMode(mode);
    audioSourceModeRef.current = mode;

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value =
        mode === 'music' || isMicMutedRef.current ? 0 : inputGainRef.current;
    }

    const effectiveMusicGain =
      mode === 'mic' || isMusicMutedRef.current ? 0 : musicGainRef.current;
    if (musicGainNodeRef.current) {
      musicGainNodeRef.current.gain.value = effectiveMusicGain;
    }
    if (fileGainNodeRef.current) {
      fileGainNodeRef.current.gain.value = effectiveMusicGain;
    }
  };

  // Helper to format seconds as MM:SS
  const formatAudioTime = (sec: number): string => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Play decoded in-memory AudioBuffer directly to Discord bots (100% muted in website)
  const playAudioBuffer = async (offsetSeconds = 0) => {
    if (!audioBufferRef.current) return;

    const ctx = getOrCreateAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(console.warn);
    }

    // Stop previous buffer source if running
    if (bufferSourceRef.current) {
      try {
        bufferSourceRef.current.onended = null;
        bufferSourceRef.current.stop();
        bufferSourceRef.current.disconnect();
      } catch {}
      bufferSourceRef.current = null;
    }

    // Ensure file gain node is wired into master mixer with broadcast make-up gain
    const effectiveGain =
      isMusicMutedRef.current || audioSourceModeRef.current === 'mic'
        ? 0
        : Math.max(1.5, musicGainRef.current);

    if (!fileGainNodeRef.current) {
      const gainNode = ctx.createGain();
      gainNode.gain.value = effectiveGain;
      fileGainNodeRef.current = gainNode;
      if (masterMixerRef.current) {
        gainNode.connect(masterMixerRef.current);
      }
    } else {
      fileGainNodeRef.current.gain.value = effectiveGain;
    }

    // Ensure ScriptProcessor is running to stream frames to WebSocket
    setupScriptProcessor(ctx);

    // If session is not streaming, trigger start so all bots join voice channel
    if (sessionState !== 'streaming' && sessionState !== 'connecting') {
      handleStartSession().catch(console.warn);
    }

    const duration = audioBufferRef.current.duration;
    const clampedOffset = Math.max(0, Math.min(duration > 0.1 ? duration - 0.05 : 0, offsetSeconds));

    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.loop = isFileLoopingRef.current;
    source.connect(fileGainNodeRef.current!);

    source.onended = () => {
      if (!isFileLoopingRef.current) {
        setIsPlayingFile(false);
        filePausedOffsetRef.current = 0;
        fileCurrentTimeRef.current = 0;
        setFileCurrentTime(0);
        if (fileTimeUpdateTimerRef.current) {
          clearInterval(fileTimeUpdateTimerRef.current);
          fileTimeUpdateTimerRef.current = null;
        }
      }
    };

    source.start(0, clampedOffset);
    bufferSourceRef.current = source;
    filePlaybackStartedAtRef.current = ctx.currentTime;
    filePausedOffsetRef.current = clampedOffset;
    fileCurrentTimeRef.current = clampedOffset;
    setFileCurrentTime(clampedOffset);
    setIsPlayingFile(true);

    // Update progress seek timer every 100ms
    if (fileTimeUpdateTimerRef.current) {
      clearInterval(fileTimeUpdateTimerRef.current);
    }
    fileTimeUpdateTimerRef.current = setInterval(() => {
      if (audioBufferRef.current && isPlayingFile) {
        const elapsed = ctx.currentTime - filePlaybackStartedAtRef.current;
        let current = filePausedOffsetRef.current + elapsed;
        const dur = audioBufferRef.current.duration;
        if (isFileLoopingRef.current && dur > 0) {
          current = current % dur;
        } else if (current > dur) {
          current = dur;
        }
        fileCurrentTimeRef.current = current;
        setFileCurrentTime(current);
      }
    }, 100);
  };

  // Local MP3 / WAV / Audio File Selection (Decodes in Web Audio - 100% Muted locally)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsFileLoading(true);
      setCurrentFileName(file.name);

      const arrayBuffer = await file.arrayBuffer();
      const ctx = getOrCreateAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(console.warn);
      }

      const decoded = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = decoded;
      setFileDuration(decoded.duration);
      setFileCurrentTime(0);
      fileCurrentTimeRef.current = 0;
      filePausedOffsetRef.current = 0;
      setIsFileLoading(false);

      // Immediately begin playback to Discord bots
      await playAudioBuffer(0);
    } catch (err: any) {
      console.error('Failed to decode audio file:', err);
      setIsFileLoading(false);
    }
  };

  // Play / Pause toggle
  const handleTogglePlayFile = async () => {
    if (!audioBufferRef.current) return;

    if (isPlayingFile) {
      // Pause
      const ctx = getOrCreateAudioContext();
      const elapsed = ctx.currentTime - filePlaybackStartedAtRef.current;
      let current = filePausedOffsetRef.current + elapsed;
      if (audioBufferRef.current && current >= audioBufferRef.current.duration) {
        current = 0;
      }
      filePausedOffsetRef.current = current;
      fileCurrentTimeRef.current = current;
      setFileCurrentTime(current);

      if (bufferSourceRef.current) {
        try {
          bufferSourceRef.current.onended = null;
          bufferSourceRef.current.stop();
          bufferSourceRef.current.disconnect();
        } catch {}
        bufferSourceRef.current = null;
      }
      if (fileTimeUpdateTimerRef.current) {
        clearInterval(fileTimeUpdateTimerRef.current);
        fileTimeUpdateTimerRef.current = null;
      }
      setIsPlayingFile(false);
    } else {
      // Play
      await playAudioBuffer(filePausedOffsetRef.current);
    }
  };

  // Seek position in audio track
  const handleSeekFile = async (newTime: number) => {
    if (!audioBufferRef.current) return;
    const clamped = Math.max(0, Math.min(fileDuration, newTime));
    filePausedOffsetRef.current = clamped;
    fileCurrentTimeRef.current = clamped;
    setFileCurrentTime(clamped);

    if (isPlayingFile) {
      await playAudioBuffer(clamped);
    }
  };

  // Toggle Loop
  const handleToggleFileLoop = () => {
    const next = !isFileLooping;
    setIsFileLooping(next);
    isFileLoopingRef.current = next;
    if (bufferSourceRef.current) {
      bufferSourceRef.current.loop = next;
    }
  };

  // Delete / Remove current file
  const handleDeleteFile = () => {
    if (bufferSourceRef.current) {
      try {
        bufferSourceRef.current.onended = null;
        bufferSourceRef.current.stop();
        bufferSourceRef.current.disconnect();
      } catch {}
      bufferSourceRef.current = null;
    }
    if (fileTimeUpdateTimerRef.current) {
      clearInterval(fileTimeUpdateTimerRef.current);
      fileTimeUpdateTimerRef.current = null;
    }
    audioBufferRef.current = null;
    setCurrentFileName(null);
    setFileDuration(0);
    setFileCurrentTime(0);
    fileCurrentTimeRef.current = 0;
    filePausedOffsetRef.current = 0;
    setIsPlayingFile(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Bot Sound Test: Plays a continuous harmonic melody chime directly through all connected bots
  const handleToggleTestChime = async () => {
    const ctx = getOrCreateAudioContext();
    if (isPlayingTestChime) {
      if (testChimeIntervalRef.current) {
        clearInterval(testChimeIntervalRef.current);
        testChimeIntervalRef.current = null;
      }
      setIsPlayingTestChime(false);
      return;
    }

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(console.warn);
    }

    setIsPlayingTestChime(true);

    if (sessionState !== 'streaming' && sessionState !== 'connecting') {
      await handleStartSession();
    }

    setupScriptProcessor(ctx);

    const tones = [523.25, 659.25, 783.99, 1046.50, 880.00, 659.25, 523.25];
    let noteIdx = 0;

    const playNote = () => {
      try {
        if (ctx.state === 'closed') return;
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        const freq = tones[noteIdx];
        noteIdx = (noteIdx + 1) % tones.length;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 1.5, ctx.currentTime);

        gain.gain.setValueAtTime(0.7, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        osc2.connect(gain);
        if (masterMixerRef.current) {
          gain.connect(masterMixerRef.current);
        }

        osc.start();
        osc2.start();
        osc.stop(ctx.currentTime + 0.35);
        osc2.stop(ctx.currentTime + 0.35);
      } catch (err) {
        console.warn('Test chime error:', err);
      }
    };

    playNote();
    testChimeIntervalRef.current = setInterval(playNote, 380);
  };

  // START VOICE & MUSIC SESSION TO ALL BOTS AT UNIFIED VOLUME
  const handleStartSession = async () => {
    if (!currentWorkspace) return;
    if (isStartingRef.current || sessionState === 'connecting' || sessionState === 'streaming') {
      return;
    }
    isStartingRef.current = true;
    setErrorMsg(null);

    let targetDestinations: Array<{
      botId: string;
      botName: string;
      guildId: string;
      guildName: string;
      channelId: string;
      channelName: string;
    }> = [];

    if (routingMode === 'fleet') {
      const activeGuildId = effectiveGuildId;
      const activeChannelId = effectiveChannelId;

      if (!activeGuildId) {
        setErrorMsg('Please enter or select a Target Discord Server / Guild ID.');
        isStartingRef.current = false;
        return;
      }

      if (!activeChannelId) {
        setErrorMsg('Please enter or select a Target Voice Channel ID.');
        isStartingRef.current = false;
        return;
      }

      if (activeGuildId === activeChannelId) {
        setErrorMsg(
          'Target Server ID and Voice Channel ID cannot be the same! Target Server ID is your Guild ID (e.g. 1499406517470756955), and Target Voice Channel ID must be the Voice Channel ID (e.g. 1499406518313947284).'
        );
        isStartingRef.current = false;
        return;
      }

      if (selectedFleetBotIds.length === 0) {
        setErrorMsg('Please select at least one Discord Bot to connect.');
        isStartingRef.current = false;
        return;
      }

      const activeGuildName =
        currentFleetGuild?.displayName || `Server #${activeGuildId.slice(-4)}`;
      const activeChannelName = effectiveChannelDisplayName;

      targetDestinations = selectedFleetBotIds
        .map((bId) => {
          const bot = botsList.find((b) => b.id === bId);
          return {
            botId: bId,
            botName: bot?.displayName || 'Discord Bot',
            guildId: activeGuildId,
            guildName: activeGuildName,
            channelId: activeChannelId,
            channelName: activeChannelName,
            liveGuildIds: bot?.liveGuildIds || [],
          };
        })
        .filter((d) => {
          if (d.liveGuildIds && d.liveGuildIds.length > 0) {
            const targetDiscordGuildId = currentFleetGuild?.guildId || activeGuildId;
            return (
              d.liveGuildIds.includes(targetDiscordGuildId) ||
              d.liveGuildIds.includes(d.guildId)
            );
          }
          return true;
        });
    } else {
      const selected = availableDestinations.filter((d) => selectedDestinationIds.includes(d.id));
      if (selected.length === 0) {
        setErrorMsg('Please select at least one voice destination.');
        isStartingRef.current = false;
        return;
      }
      targetDestinations = selected.map((d) => ({
        botId: d.botId,
        botName: d.botName,
        guildId: d.guildId,
        guildName: d.guildName,
        channelId: d.channelId,
        channelName: d.channelName,
      }));
    }

    setSessionState('connecting');

    try {
      // 1. Initialize Master Web Audio Context and ensure active state
      const audioCtx = getOrCreateAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(console.warn);
      }

      // 2. Prompt user to bridge YouTube / Spotify tab audio if in music/dj mode and not yet connected (skip if testing chime)
      if (
        (audioSourceMode === 'music' || audioSourceMode === 'dj') &&
        !isMusicConnected &&
        !isPlayingFile &&
        !isPlayingTestChime
      ) {
        try {
          await handleConnectMusicCapture();
        } catch (tabErr) {
          console.warn('Tab audio prompt skipped:', tabErr);
        }
      }

      // 3. Request Microphone Access (optional; never block music if mic is unavailable or denied)
      if (audioSourceMode !== 'music') {
        try {
          const constraints: MediaStreamConstraints = {
            audio: {
              deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: true },
              channelCount: 1,
              sampleRate: 48000,
            },
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          mediaStreamRef.current = stream;

          const source = audioCtx.createMediaStreamSource(stream);
          micSourceRef.current = source;

          const gainNode = audioCtx.createGain();
          gainNode.gain.value = isMicMuted ? 0 : inputGain;
          gainNodeRef.current = gainNode;

          // High-Pass Filter (90Hz rumble, AC hum, and room noise cut)
          const highPass = audioCtx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = highPassFilter ? 90 : 20;

          // Dynamics Compressor (gentle studio voice leveling)
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
          compressor.knee.setValueAtTime(12, audioCtx.currentTime);
          compressor.ratio.setValueAtTime(compressorEnabled ? 3 : 1, audioCtx.currentTime);
          compressor.attack.setValueAtTime(0.005, audioCtx.currentTime);
          compressor.release.setValueAtTime(0.12, audioCtx.currentTime);

          // Analyser Node for Input VU Meter
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          micAnalyserRef.current = analyser;

          // Connect microphone chain into Master Mixer
          source.connect(gainNode);
          gainNode.connect(highPass);
          highPass.connect(compressor);
          compressor.connect(analyser);

          if (masterMixerRef.current) {
            compressor.connect(masterMixerRef.current);
          }

          // Live Speech VU Meter loop
          const pcmData = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            if (analyser) {
              analyser.getByteFrequencyData(pcmData);
              let sum = 0;
              for (let i = 0; i < pcmData.length; i++) {
                sum += pcmData[i];
              }
              const avg = sum / pcmData.length;
              const level = Math.min(100, Math.round((avg / 128) * 100));
              setInputVuLevel(isMicMuted ? 0 : level);
            }
            animationFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        } catch (micErr: any) {
          console.warn('Microphone access skipped (not found or denied); continuing in music/audio stream mode:', micErr?.message || micErr);
          setAudioSourceMode('music');
        }
      }

      // 3. Create Voice Session on Backend API with Unified Volume
      const sessionPayload = {
        workspaceId: currentWorkspace.id,
        destinations: targetDestinations.map((d) => ({
          botId: d.botId,
          guildConnectionId: d.guildId,
          channelConfigId: d.channelId,
        })),
        audioConfiguration: {
          sampleRate: 48000,
          channels: 1,
          noiseSuppression,
          highPassFilter,
          compressor: compressorEnabled,
          inputGain: masterGain, // Send unified gain up to 100.0 (10000%)
        },
      };

      let sessionRes = await fetch('/api/voice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      });

      // If edge proxy or tunnel timed out, auto-retry once after a short buffer
      if (sessionRes.status === 504 || sessionRes.status === 502) {
        await new Promise((r) => setTimeout(r, 1200));
        sessionRes = await fetch('/api/voice-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionPayload),
        });
      }

      const contentType = sessionRes.headers.get('content-type') || '';
      let sessionJson: any = null;
      if (contentType.includes('application/json')) {
        sessionJson = await sessionRes.json();
        if (!sessionRes.ok) {
          const detail =
            sessionJson.error?.message ||
            sessionJson.message ||
            (typeof sessionJson.error === 'string' ? sessionJson.error : '') ||
            'Failed to create voice session';
          throw new Error(detail);
        }
      } else {
        const text = await sessionRes.text();
        if (!sessionRes.ok) {
          throw new Error(
            sessionRes.status === 504 || sessionRes.status === 502
              ? 'Server or tunnel connection refreshed. Please click Stream again.'
              : `Server returned HTTP ${sessionRes.status}: ${text.slice(0, 120)}`
          );
        }
      }

      if (!sessionJson?.data?.sessionId) {
        throw new Error('Failed to create voice session: Invalid response received from server.');
      }

      const { sessionId, mediaToken, endpoints } = sessionJson.data;
      setCurrentSessionId(sessionId);

      // Initialize all output cards to the exact same unified volume
      setOutputCards(
        (endpoints || []).map((ep: any, idx: number) => {
          const matchedDest =
            targetDestinations.find((d) => d.botId === ep.botId) || targetDestinations[idx];
          return {
            endpointId: ep.endpointId || `ep_${idx}`,
            botId: ep.botId || matchedDest?.botId,
            botName: matchedDest?.botName || 'Discord Bot',
            channelName: matchedDest?.channelName || 'Voice Channel',
            guildName: matchedDest?.guildName || 'Discord Server',
            state: 'connecting',
            gain: masterGain, // exact same volume for every bot
            muted: false,
            vuLevel: 0,
          };
        })
      );

      // 4. Connect to Media Gateway WebSocket (supports secure wss:// over HTTPS and /media-stream proxy)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/media-stream?token=${mediaToken}`;
      console.log('[VoiceStudio] Connecting to MediaGateway WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      // 5. Attach ScriptProcessorNode to stream mixed PCM frames from master mixer
      setupScriptProcessor(audioCtx);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'VU_METER') {
            setOutputCards((prev) =>
              prev.map((card) => {
                const ep = msg.endpoints?.find((e: any) => e.endpointId === card.endpointId);
                return ep ? { ...card, vuLevel: ep.vuLevel, state: ep.state || card.state } : card;
              })
            );
          } else if (msg.type === 'ENDPOINT_STATUS') {
            setOutputCards((prev) =>
              prev.map((card) =>
                card.endpointId === msg.endpointId
                  ? { ...card, state: msg.state || card.state }
                  : card
              )
            );
          } else if (msg.type === 'STATE_CHANGED') {
            if (msg.state === 'streaming') {
              setSessionState('streaming');
              setActiveVoiceSession({ sessionId, state: 'streaming' });
            } else if (msg.state === 'stopped') {
              setSessionState('stopped');
              setActiveVoiceSession(null);
            }
            if (typeof msg.masterGain === 'number') {
              setMasterGain(msg.masterGain);
              masterGainRef.current = msg.masterGain;
              setOutputCards((prev) => prev.map((c) => ({ ...c, gain: msg.masterGain })));
            }
            if (typeof msg.masterMuted === 'boolean') {
              setMasterMuted(msg.masterMuted);
              masterMutedRef.current = msg.masterMuted;
            }
          } else if (msg.type === 'EMERGENCY_STOP_TRIGGERED') {
            handleLocalEmergencyHalt();
          }
        } catch {}
      };

      ws.onopen = async () => {
        try {
          console.log('[VoiceStudio] MediaGateway WebSocket opened! Starting transmission on backend...');
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'SET_MASTER_GAIN', gain: masterGain }));
          }
          await fetch(`/api/voice-sessions/${sessionId}/start`, { method: 'POST' });
          setSessionState('streaming');
          setActiveVoiceSession({ sessionId, state: 'streaming' });
        } catch (sErr) {
          console.warn('Session start trigger warning:', sErr);
        } finally {
          isStartingRef.current = false;
        }
      };

      ws.onerror = (err) => {
        console.warn('[VoiceStudio] Media Gateway WebSocket error:', err);
      };

      ws.onclose = (ev) => {
        console.log(`[VoiceStudio] Media Gateway WebSocket closed: code=${ev.code}, reason=${ev.reason}`);
      };
    } catch (err: any) {
      console.error('Start session error:', err);
      setErrorMsg(err.message || 'Audio session initialization failed');
      setSessionState('idle');
      isStartingRef.current = false;
    }
  };

  // STOP VOICE SESSION
  const handleStopSession = async () => {
    isStartingRef.current = false;
    setSessionState('stopping');

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (testChimeIntervalRef.current) {
      clearInterval(testChimeIntervalRef.current);
      testChimeIntervalRef.current = null;
    }
    setIsPlayingTestChime(false);

    if (bufferSourceRef.current) {
      try {
        bufferSourceRef.current.onended = null;
        bufferSourceRef.current.stop();
        bufferSourceRef.current.disconnect();
      } catch {}
      bufferSourceRef.current = null;
    }
    if (fileTimeUpdateTimerRef.current) {
      clearInterval(fileTimeUpdateTimerRef.current);
      fileTimeUpdateTimerRef.current = null;
    }
    setIsPlayingFile(false);

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    if (currentSessionId) {
      try {
        await fetch(`/api/voice-sessions/${currentSessionId}/stop`, { method: 'POST' });
      } catch {}
    }

    setSessionState('idle');
    setCurrentSessionId(null);
    setInputVuLevel(0);
    setOutputCards((prev) => prev.map((c) => ({ ...c, state: 'disconnected', vuLevel: 0 })));
    setActiveVoiceSession(null);
  };

  // LOCAL EMERGENCY HALT
  const handleLocalEmergencyHalt = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (musicStreamRef.current) {
      musicStreamRef.current.getTracks().forEach((track) => track.stop());
      musicStreamRef.current = null;
    }
    if (testChimeIntervalRef.current) {
      clearInterval(testChimeIntervalRef.current);
      testChimeIntervalRef.current = null;
    }
    setIsPlayingTestChime(false);

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    setSessionState('stopped');
    setInputVuLevel(0);
    setMusicVuLevel(0);
    setIsMusicConnected(false);
    setOutputCards((prev) => prev.map((c) => ({ ...c, state: 'disconnected', vuLevel: 0 })));
    setActiveVoiceSession(null);
  };

  const handleOutputGainChange = (endpointId: string, gain: number) => {
    setOutputCards((prev) =>
      prev.map((c) => (c.endpointId === endpointId ? { ...c, gain } : c))
    );
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_ENDPOINT_GAIN', endpointId, gain }));
    }
  };

  const handleOutputMuteToggle = (endpointId: string) => {
    setOutputCards((prev) =>
      prev.map((c) => {
        if (c.endpointId === endpointId) {
          const nextMuted = !c.muted;
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'SET_ENDPOINT_MUTE',
                endpointId,
                muted: nextMuted,
              })
            );
          }
          return { ...c, muted: nextMuted, state: nextMuted ? 'muted' : 'connected' };
        }
        return c;
      })
    );
  };

  const handleReconnectEndpoint = async (endpointId: string) => {
    setOutputCards((prev) =>
      prev.map((c) => (c.endpointId === endpointId ? { ...c, state: 'reconnecting' } : c))
    );

    // Send via WebSocket for instant processing
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'RECONNECT_ENDPOINT', endpointId }));
    }

    // Call REST endpoint as reliable fallback
    if (currentSessionId) {
      try {
        await fetch(`/api/voice-sessions/${currentSessionId}/endpoints/${endpointId}`, {
          method: 'POST',
        });
      } catch (err) {
        console.warn('Endpoint reconnect warning:', err);
      }
    }
  };

  const handleReconnectAllDisconnected = async () => {
    const disconnectedCards = outputCards.filter(
      (c) => c.state === 'disconnected' || c.state === 'failed'
    );
    for (const card of disconnectedCards) {
      await handleReconnectEndpoint(card.endpointId);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const toggleDestinationSelection = (destId: string) => {
    if (sessionState === 'streaming') return;
    setSelectedDestinationIds((prev) =>
      prev.includes(destId) ? prev.filter((id) => id !== destId) : [...prev, destId]
    );
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-border/50">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              <span>Live Voice &amp; Music Studio</span>
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition ${
                sessionState === 'streaming'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-secondary text-muted-foreground border-border/80'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sessionState === 'streaming'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-muted-foreground/60'
                }`}
              />
              {sessionState === 'streaming' ? 'Live Transmitting' : 'Studio Standby'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Broadcast studio-grade microphone audio, browser tab audio (Spotify, YouTube), and media files directly to Discord voice channels.
          </p>
        </div>

        {/* Master Controls & Global Emergency Stop */}
        <div className="flex items-center space-x-2.5">
          {sessionState === 'streaming' ? (
            <button
              onClick={handleStopSession}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs border border-border shadow-xs transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Broadcast</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={
                sessionState === 'connecting' ||
                sessionState === 'stopping' ||
                (routingMode === 'fleet'
                  ? selectedFleetBotIds.length === 0 || !effectiveChannelId || !effectiveGuildId
                  : selectedDestinationIds.length === 0)
              }
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {sessionState === 'connecting' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
                  <span>Connecting Bots to Channel...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {routingMode === 'fleet'
                      ? `Stream to All (${selectedFleetBotIds.length}) Bots`
                      : 'Start Transmission'}
                  </span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => {
              handleLocalEmergencyHalt();
              triggerEmergencyStop();
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-destructive/10 hover:bg-destructive hover:text-white text-destructive border border-destructive/30 font-semibold text-xs transition active:scale-95 cursor-pointer"
            title="Immediately disconnect all active voice endpoints"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Emergency Stop</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STUDIO LAYOUT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. INPUT MIXER & AUDIO SOURCES SECTION */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
              Audio Routing Mode
            </h2>
            {/* Clean Segmented Control */}
            <div className="grid grid-cols-3 gap-1 bg-secondary/70 p-1 rounded-lg text-xs border border-border/60">
              <button
                type="button"
                onClick={() => {
                  handleAudioSourceModeChange('dj');
                  setActiveDeckTab('music');
                }}
                className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  audioSourceMode === 'dj'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Hybrid Mix</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAudioSourceModeChange('music');
                  if (activeDeckTab === 'mic') setActiveDeckTab('music');
                }}
                className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  audioSourceMode === 'music'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Music className="w-3.5 h-3.5 text-primary" />
                <span>Media Only</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleAudioSourceModeChange('mic');
                  setActiveDeckTab('mic');
                }}
                className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  audioSourceMode === 'mic'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mic className="w-3.5 h-3.5 text-primary" />
                <span>Voice Only</span>
              </button>
            </div>
          </div>

          {/* Sub-Channel Tabs */}
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setActiveDeckTab('music')}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                  activeDeckTab === 'music'
                    ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Cast className="w-3.5 h-3.5" />
                <span>Browser Tab</span>
                {isMusicConnected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeckTab('file')}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                  activeDeckTab === 'file'
                    ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileAudio className="w-3.5 h-3.5" />
                <span>Audio File</span>
                {isPlayingFile && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDeckTab('mic')}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                  activeDeckTab === 'mic'
                    ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Microphone</span>
              </button>
            </div>

            {/* Mute button for the active deck */}
            {activeDeckTab === 'mic' ? (
              <button
                type="button"
                onClick={toggleMicMute}
                className={`p-1.5 rounded-md border text-xs transition cursor-pointer ${
                  isMicMuted
                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground border-border'
                }`}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMusicMute}
                disabled={activeDeckTab === 'music' ? !isMusicConnected : !currentFileName}
                className={`p-1.5 rounded-md border text-xs transition cursor-pointer ${
                  isMusicMuted
                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground border-border disabled:opacity-40'
                }`}
                title={isMusicMuted ? 'Unmute Audio Bridge' : 'Mute Audio Bridge'}
              >
                {isMusicMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* CHANNEL 1: BROWSER TAB (SPOTIFY / YOUTUBE) */}
          {activeDeckTab === 'music' && (
            <div className="space-y-4">
              {!isMusicConnected ? (
                <div className="p-4 rounded-xl bg-secondary/30 border border-border/80 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                      <Cast className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">Browser Tab Audio Bridge</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        Capture audio directly from Spotify, YouTube, or any active browser tab.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectMusicCapture}
                    className="w-full py-2.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Cast className="w-3.5 h-3.5" />
                    <span>Connect Browser Audio</span>
                  </button>

                  <p className="text-[10px] text-muted-foreground leading-normal border-t border-border/50 pt-2 text-center">
                    Select <strong>Chrome Tab</strong> and ensure <strong>&quot;Also share tab audio&quot;</strong> is checked.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-secondary/40 border border-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <div className="truncate">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        Connected Audio Stream
                      </div>
                      <div className="text-xs font-semibold text-foreground truncate">
                        {musicSourceName || 'Active Browser Tab'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectMusicCapture}
                    className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-medium border border-border transition shrink-0 cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* Error Notice */}
              {musicError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] text-destructive space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Audio Bridge Notice</span>
                  </div>
                  <div>{musicError}</div>
                </div>
              )}

              {/* Music VU Meter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span>Signal Activity</span>
                  </span>
                  <span className="font-mono text-[11px] text-foreground">{musicVuLevel}%</span>
                </div>
                <div className="h-2 w-full bg-secondary/80 rounded-full overflow-hidden p-0.5 border border-border/60">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      musicVuLevel > 80
                        ? 'bg-amber-400'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${isMusicConnected ? musicVuLevel : 0}%` }}
                  />
                </div>
              </div>

              {/* Music Pre-Amp Booster Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Pre-Amp Booster</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {Math.round(musicGain * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={musicGain}
                  onChange={(e) => handleSetMusicGain(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-secondary rounded-lg"
                />
                <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-0.5">
                  <span className="text-muted-foreground text-[10px] mr-0.5">Presets:</span>
                  {[
                    { label: '100%', val: 1.0 },
                    { label: '200%', val: 2.0 },
                    { label: '500%', val: 5.0 },
                    { label: '1000%', val: 10.0 },
                    { label: '10000%', val: 100.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSetMusicGain(p.val)}
                      className={`px-2 py-0.5 rounded border transition cursor-pointer ${
                        Math.round(musicGain * 100) === Math.round(p.val * 100)
                          ? 'bg-primary text-primary-foreground font-semibold border-primary'
                          : 'bg-secondary/70 text-muted-foreground border-border hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Studio Test Tone Diagnostic */}
              <div className="pt-2 border-t border-border/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      Output Diagnostic Tone
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Verify Discord voice connectivity with a calibrated tone.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleTestChime}
                    className={`px-2.5 py-1.5 rounded-md font-medium text-xs flex items-center gap-1.5 border transition cursor-pointer ${
                      isPlayingTestChime
                        ? 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25'
                        : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                    }`}
                  >
                    {isPlayingTestChime ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Stop Tone</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-primary" />
                        <span>Test Tone</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Launch Links */}
              <div className="pt-2 border-t border-border/50 space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground block">
                  Quick Launch Media:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <a
                    href="https://open.spotify.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-medium text-foreground transition"
                  >
                    <span>Spotify</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                  <a
                    href="https://music.youtube.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-medium text-foreground transition"
                  >
                    <span>YT Music</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                  <a
                    href="https://www.youtube.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-md bg-secondary/60 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-medium text-foreground transition"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* CHANNEL 2: LOCAL AUDIO FILE PLAYER */}
          {activeDeckTab === 'file' && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {isFileLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  <span>Decoding audio buffer into memory...</span>
                </div>
              ) : currentFileName ? (
                <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="truncate max-w-[200px]">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                        Loaded Audio Track
                      </span>
                      <span className="text-xs font-semibold text-foreground truncate block">
                        {currentFileName}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      <strong className="text-foreground">{formatAudioTime(fileCurrentTime)}</strong>
                      <span className="mx-1">/</span>
                      <span>{formatAudioTime(fileDuration)}</span>
                    </span>
                  </div>

                  {/* Scrubber slider */}
                  <div className="space-y-1">
                    <input
                      type="range"
                      min="0"
                      max={fileDuration || 100}
                      step="0.1"
                      value={fileCurrentTime}
                      onChange={(e) => handleSeekFile(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-secondary rounded-lg accent-primary cursor-pointer"
                      title={`Position: ${formatAudioTime(fileCurrentTime)}`}
                    />
                  </div>

                  {/* Transport Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleTogglePlayFile}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition cursor-pointer ${
                          isPlayingFile
                            ? 'bg-secondary text-foreground border border-border hover:bg-secondary/80'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        }`}
                      >
                        {isPlayingFile ? (
                          <>
                            <Pause className="w-3.5 h-3.5 fill-current" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play to Bots</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleFileLoop}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition cursor-pointer ${
                          isFileLooping
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                        }`}
                        title={isFileLooping ? 'Looping Active' : 'Looping Disabled'}
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        <span>Loop</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteFile}
                        className="text-xs text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition"
                        title="Remove audio track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 text-center border border-dashed border-border/80 hover:border-primary/50 bg-secondary/20 hover:bg-secondary/40 rounded-xl cursor-pointer transition space-y-2"
                >
                  <FileAudio className="w-6 h-6 text-muted-foreground mx-auto" />
                  <div className="text-xs font-semibold text-foreground">Upload Audio File</div>
                  <p className="text-[11px] text-muted-foreground max-w-[240px] mx-auto">
                    Select an MP3, WAV, or AAC file to stream directly to Discord voice channels.
                  </p>
                </div>
              )}

              {/* Direct Stream Action */}
              {(currentFileName || isMusicConnected) && (
                <div className="pt-1">
                  {sessionState === 'connecting' ? (
                    <div className="py-2 px-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Connecting All Bots to Voice Channel...</span>
                    </div>
                  ) : sessionState !== 'streaming' ? (
                    <button
                      type="button"
                      onClick={handleStartSession}
                      disabled={sessionState === 'stopping'}
                      className="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Start Streaming File to All Bots</span>
                    </button>
                  ) : (
                    <div className="py-2 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Broadcasting live to all bots</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* CHANNEL 3: MICROPHONE & VOICE INGEST */}
          {activeDeckTab === 'mic' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Input Hardware Device
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={sessionState === 'streaming'}
                  className="w-full bg-secondary/80 border border-border rounded-lg text-xs px-3 py-2 text-foreground outline-none disabled:opacity-50"
                >
                  {audioDevices.length === 0 ? (
                    <option value="">Default Microphone</option>
                  ) : (
                    audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Input Level VU */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Microphone Level</span>
                  <span className="font-mono text-[11px] text-foreground">{inputVuLevel}%</span>
                </div>
                <div className="h-2 w-full bg-secondary/80 rounded-full overflow-hidden p-0.5 border border-border/60">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      inputVuLevel > 85 ? 'bg-amber-400' : 'bg-primary'
                    }`}
                    style={{ width: `${inputVuLevel}%` }}
                  />
                </div>
              </div>

              {/* Input Gain */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Pre-Amp Input Gain</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {Math.round(inputGain * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={inputGain}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setInputGain(val);
                    if (gainNodeRef.current) gainNodeRef.current.gain.value = val;
                  }}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-secondary rounded-lg"
                />
              </div>

              {/* Studio Filters & Switches */}
              <div className="space-y-2 pt-2 border-t border-border/50 text-xs">
                <label className="flex items-center justify-between cursor-pointer py-0.5">
                  <span className="text-foreground">Noise Suppression</span>
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => setNoiseSuppression(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-0.5">
                  <span className="text-foreground">High-Pass Filter (80Hz Cut)</span>
                  <input
                    type="checkbox"
                    checked={highPassFilter}
                    onChange={(e) => setHighPassFilter(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-0.5">
                  <span className="text-foreground">Dynamics Compressor</span>
                  <input
                    type="checkbox"
                    checked={compressorEnabled}
                    onChange={(e) => setCompressorEnabled(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer py-0.5">
                  <span className="text-foreground">Local Audio Monitor</span>
                  <input
                    type="checkbox"
                    checked={previewAudio}
                    onChange={(e) => setPreviewAudio(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 2. FLEET CHANNEL CONNECTOR PANEL */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Fleet Channel Routing</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Route your audio stream to all fleet bots joined to a single target voice channel.
                </p>
              </div>

              {/* Routing Mode Tabs */}
              <div className="flex bg-secondary/80 p-0.5 rounded-lg text-xs border border-border/60 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setRoutingMode('fleet')}
                  className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                    routingMode === 'fleet'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Bots in Channel
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode('custom')}
                  className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
                    routingMode === 'custom'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Custom Matrix
                </button>
              </div>
            </div>

            {/* FLEET CONNECTOR MODE */}
            {routingMode === 'fleet' ? (
              <div className="space-y-4 text-xs">
                {/* Server & Channel Configuration Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* TARGET SERVER (GUILD) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Target Server (Guild ID)</span>
                      </label>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setGuildInputMode('manual')}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                            guildInputMode === 'manual'
                              ? 'bg-secondary text-foreground font-semibold border border-border'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Manual
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuildInputMode('dropdown')}
                          disabled={guildsList.length === 0}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                            guildInputMode === 'dropdown'
                              ? 'bg-secondary text-foreground font-semibold border border-border'
                              : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                          }`}
                        >
                          List ({guildsList.length})
                        </button>
                      </div>
                    </div>

                    {guildInputMode === 'manual' || guildsList.length === 0 ? (
                      <div className="space-y-1">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder="Enter Discord Server ID (e.g. 1499406517470756955)..."
                            value={manualGuildId}
                            onChange={(e) => setManualGuildId(e.target.value)}
                            disabled={sessionState === 'streaming'}
                            className="w-full bg-secondary/60 border border-border focus:border-primary/60 rounded-lg pl-3 pr-16 py-2 text-foreground font-mono outline-none text-xs transition"
                          />
                          <button
                            type="button"
                            onClick={handlePasteGuildId}
                            disabled={sessionState === 'streaming'}
                            title="Paste Server ID from clipboard"
                            className="absolute right-1 px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-[10px] font-medium border border-border/60 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Clipboard className="w-3 h-3" />
                            <span>Paste</span>
                          </button>
                        </div>
                        <div className="text-[10px] text-muted-foreground px-0.5">
                          Right-click server in Discord &gt; &quot;Copy Server ID&quot;
                        </div>
                      </div>
                    ) : (
                      <select
                        value={selectedFleetGuildId}
                        onChange={(e) => {
                          handleFleetGuildChange(e.target.value);
                          setManualGuildId(e.target.value);
                        }}
                        disabled={sessionState === 'streaming' || guildsList.length === 0}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none disabled:opacity-50 text-xs"
                      >
                        {guildsList.map((g) => (
                          <option key={g.guildId || g.id} value={g.guildId || g.id}>
                            {g.displayName} ({g.guildId || g.id})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* TARGET VOICE CHANNEL */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Target Voice Channel ID</span>
                      </label>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setChannelInputMode('manual')}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                            channelInputMode === 'manual'
                              ? 'bg-secondary text-foreground font-semibold border border-border'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Manual
                        </button>
                        <button
                          type="button"
                          onClick={() => setChannelInputMode('dropdown')}
                          disabled={currentFleetVoiceChannels.length === 0}
                          className={`text-[10px] px-2 py-0.5 rounded transition cursor-pointer ${
                            channelInputMode === 'dropdown'
                              ? 'bg-secondary text-foreground font-semibold border border-border'
                              : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                          }`}
                        >
                          List ({currentFleetVoiceChannels.length})
                        </button>
                      </div>
                    </div>

                    {channelInputMode === 'manual' || currentFleetVoiceChannels.length === 0 ? (
                      <div className="space-y-1.5">
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            placeholder="Enter Voice Channel ID (e.g. 1499406518313947284)..."
                            value={manualChannelId}
                            onChange={(e) => setManualChannelId(e.target.value)}
                            disabled={sessionState === 'streaming'}
                            className="w-full bg-secondary/60 border border-border focus:border-primary/60 rounded-lg pl-3 pr-24 py-2 text-foreground font-mono outline-none text-xs transition"
                          />
                          <div className="absolute right-1 flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={handlePasteChannelId}
                              disabled={sessionState === 'streaming'}
                              title="Paste Channel ID from clipboard"
                              className="px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-[10px] font-medium border border-border/60 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Clipboard className="w-3 h-3" />
                              <span>Paste</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleAutoDetectChannels}
                              disabled={isDetectingChannels || sessionState === 'streaming'}
                              title="Auto-detect voice channels in server"
                              className="p-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border/60 transition cursor-pointer"
                            >
                              <Wand2 className={`w-3 h-3 ${isDetectingChannels ? 'animate-spin text-primary' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                          <span>Right-click voice channel in Discord &gt; &quot;Copy Channel ID&quot;</span>
                          {detectMsg && <span className="text-primary font-medium">{detectMsg}</span>}
                        </div>

                        {/* Clean Quick Channel Selector */}
                        {currentFleetVoiceChannels.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <span className="text-[10px] text-muted-foreground block font-medium">
                              Quick Select Detected Channels:
                            </span>
                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                              {currentFleetVoiceChannels.map((ch: any) => {
                                const chId = ch.channelId || ch.id;
                                const isSelected = manualChannelId === chId || selectedFleetChannelId === chId;
                                return (
                                  <button
                                    key={chId}
                                    type="button"
                                    onClick={() => {
                                      setManualChannelId(chId);
                                      setSelectedFleetChannelId(chId);
                                    }}
                                    className={`text-[10px] px-2 py-1 rounded-md border transition flex items-center gap-1.5 cursor-pointer ${
                                      isSelected
                                        ? 'bg-primary/10 border-primary text-primary font-medium'
                                        : 'bg-secondary/50 border-border/70 text-muted-foreground hover:text-foreground hover:bg-secondary'
                                    }`}
                                  >
                                    <Volume2 className="w-3 h-3 opacity-70 shrink-0" />
                                    <span className="truncate max-w-[140px]">{ch.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        value={selectedFleetChannelId}
                        onChange={(e) => setSelectedFleetChannelId(e.target.value)}
                        disabled={sessionState === 'streaming' || currentFleetVoiceChannels.length === 0}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none disabled:opacity-50 text-xs"
                      >
                        {currentFleetVoiceChannels.map((ch: any) => (
                          <option key={ch.id || ch.channelId} value={ch.id || ch.channelId}>
                            #{ch.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Fleet Bots Roster Card */}
                <div className="p-4 rounded-xl bg-secondary/30 border border-border/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                      <span>
                        Fleet Bot Roster ({selectedFleetBotIds.length} of {botsList.length} Selected)
                      </span>
                    </span>

                    <div className="flex items-center space-x-2 text-xs">
                      <button
                        type="button"
                        onClick={handleSelectAllFleetBots}
                        disabled={sessionState === 'streaming'}
                        className="text-primary hover:underline font-medium cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllFleetBots}
                        disabled={sessionState === 'streaming'}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {botsList.length === 0 ? (
                    <div className="text-muted-foreground text-xs py-3 text-center">
                      No ready bots available in workspace. Please register bots on the Bot Fleet page.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-0.5">
                      {botsList.map((bot) => {
                        const isSelected = selectedFleetBotIds.includes(bot.id);
                        return (
                          <div
                            key={bot.id}
                            onClick={() => toggleFleetBot(bot.id)}
                            className={`p-2 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-primary/10 border-primary/40 text-foreground font-medium shadow-2xs'
                                : 'bg-secondary/40 border-border/70 text-muted-foreground hover:bg-secondary/70 hover:text-foreground'
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{bot.displayName}</span>
                            </div>
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border bg-secondary/50'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary Status Strip */}
                  <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span className="truncate max-w-[260px]">
                      Destination: <strong className="text-foreground">{effectiveChannelDisplayName}</strong>
                    </span>
                    <span className="text-foreground font-medium shrink-0">
                      {selectedFleetBotIds.length} bots ready to join
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* CUSTOM MATRIX MODE */
              <div className="space-y-3 text-xs">
                <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>Target Destination Matrix ({selectedDestinationIds.length} selected):</span>
                  <button
                    onClick={loadDestinations}
                    className="text-primary hover:underline text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {availableDestinations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-border">
                    No voice channels discovered. Switch to &quot;All Bots in Channel&quot; mode to enter your Voice Channel ID.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableDestinations.map((dest) => {
                      const isSelected = selectedDestinationIds.includes(dest.id);
                      return (
                        <div
                          key={dest.id}
                          onClick={() => toggleDestinationSelection(dest.id)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-primary/10 border-primary/50 text-foreground'
                              : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <div
                              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border bg-secondary/50'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <div className="truncate">
                              <div className="font-medium text-foreground truncate">{dest.channelName}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {dest.botName} • {dest.guildName}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MASTER CONTROLS & UNIFIED BROADCAST VOLUME BUS */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMasterMuted(!masterMuted)}
                  className={`p-2 rounded-lg border transition cursor-pointer ${
                    masterMuted
                      ? 'bg-destructive/15 text-destructive border-destructive/30'
                      : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                  }`}
                  title={masterMuted ? 'Unmute Master Output' : 'Mute Master Output'}
                >
                  {masterMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <div>
                  <span className="font-semibold text-foreground block">
                    Master Broadcast Gain
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    All bots synchronize to this master output level.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-foreground block">
                    {Math.round(masterGain * 100)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    {masterGain >= 100
                      ? `+${Math.round(20 * Math.log10(masterGain))} dB (Overdrive)`
                      : masterGain > 1.0
                      ? `+${Math.round(20 * Math.log10(masterGain))} dB`
                      : '0 dB (Nominal)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Precision Master Slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={masterGain}
              onChange={(e) => handleSetUnifiedGain(parseFloat(e.target.value))}
              className="w-full accent-primary cursor-pointer h-1.5 bg-secondary rounded-lg"
            />

            {/* Presets and Format Telemetry */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/50 text-[11px]">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <span className="text-muted-foreground text-[10px] mr-1 shrink-0">Presets:</span>
                {[
                  { label: '100% (0 dB)', val: 1.0 },
                  { label: '200% (+6 dB)', val: 2.0 },
                  { label: '500% (+14 dB)', val: 5.0 },
                  { label: '1000% (+20 dB)', val: 10.0 },
                  { label: '10,000% (+40 dB)', val: 100.0 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleSetUnifiedGain(p.val)}
                    className={`px-2 py-0.5 rounded border transition shrink-0 cursor-pointer ${
                      Math.round(masterGain * 100) === Math.round(p.val * 100)
                        ? 'bg-primary text-primary-foreground font-semibold border-primary'
                        : 'bg-secondary/70 text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 sm:text-right">
                <span>PCM 48kHz Stereo</span>
                <span>•</span>
                <span className="font-mono">{sessionDurationSec}s elapsed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 BIG STUDIO MASTER EQUALIZER RACK (Shapes frequency response for all bots) */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
        {/* EQ Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg border transition ${
              isEqEnabled
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-secondary border-border text-muted-foreground'
            }`}>
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground tracking-tight">
                  10-Band Master Studio Equalizer
                </h2>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                  isEqEnabled
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}>
                  {isEqEnabled ? 'Active (DSP)' : 'Bypassed'}
                </span>
                {activeEqPreset in EQ_PRESETS && (
                  <span className="hidden sm:inline-flex text-[10px] bg-secondary text-muted-foreground border border-border px-2 py-0.5 rounded-full font-medium">
                    {EQ_PRESETS[activeEqPreset].name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Precision Biquad DSP filtering applied directly to the master broadcast stream.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Toggle Bypass */}
            <button
              type="button"
              onClick={handleToggleEq}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1.5 transition cursor-pointer ${
                isEqEnabled
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
              }`}
              title={isEqEnabled ? 'Bypass Equalizer' : 'Engage Equalizer'}
            >
              <Zap className={`w-3.5 h-3.5 ${isEqEnabled ? 'fill-current' : ''}`} />
              <span>{isEqEnabled ? 'EQ Active' : 'Bypassed'}</span>
            </button>

            {/* Reset to Flat */}
            <button
              type="button"
              onClick={handleResetEq}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1.5 transition cursor-pointer"
              title="Reset all bands to 0 dB Flat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset (0 dB)</span>
            </button>

            {/* Expand / Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsEqExpanded(!isEqExpanded)}
              className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground border border-border transition cursor-pointer"
              title={isEqExpanded ? 'Collapse Equalizer' : 'Expand Equalizer'}
            >
              {isEqExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isEqExpanded && (
          <div className="space-y-4 pt-1">
            {/* Real-Time Frequency Response Visualizer Curve */}
            <div className="relative rounded-xl bg-secondary/30 border border-border/80 p-3.5 overflow-hidden">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2 font-mono px-1">
                <span className="tracking-wider uppercase">Frequency Response Curve</span>
                <span className="flex items-center gap-4">
                  <span className="text-foreground font-semibold">+12 dB</span>
                  <span>0 dB</span>
                  <span className="text-muted-foreground font-semibold">-12 dB</span>
                </span>
              </div>

              <div className="h-28 w-full relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 1000 120"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="eqCurveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Subtle Grid Lines */}
                  <line x1="30" y1="10" x2="970" y2="10" stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.6" />
                  <line x1="30" y1="35" x2="970" y2="35" stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.4" />
                  <line x1="30" y1="60" x2="970" y2="60" stroke="hsl(var(--foreground))" strokeWidth="1" opacity="0.2" />
                  <line x1="30" y1="85" x2="970" y2="85" stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.4" />
                  <line x1="30" y1="110" x2="970" y2="110" stroke="hsl(var(--border))" strokeDasharray="3 3" opacity="0.6" />

                  {/* Vertical Guide Lines */}
                  {EQ_FREQUENCIES.map((_, idx) => {
                    const x = 50 + idx * 100;
                    return (
                      <line
                        key={`guide-${idx}`}
                        x1={x}
                        y1="10"
                        x2={x}
                        y2="110"
                        stroke="hsl(var(--border))"
                        opacity="0.3"
                      />
                    );
                  })}

                  {/* Shaded Area and Curve Line */}
                  {(() => {
                    const pathD =
                      `M 50 ${60 - ((isEqEnabled ? eqGains[0] : 0) / 12) * 50} ` +
                      eqGains
                        .slice(1)
                        .map((_, i) => {
                          const idx = i + 1;
                          const currentGain = isEqEnabled ? eqGains[idx] : 0;
                          const prevGain = isEqEnabled ? eqGains[idx - 1] : 0;
                          const x = 50 + idx * 100;
                          const y = 60 - (currentGain / 12) * 50;
                          const prevX = 50 + (idx - 1) * 100;
                          const prevY = 60 - (prevGain / 12) * 50;
                          const cpX1 = prevX + 50;
                          const cpX2 = x - 50;
                          return `C ${cpX1} ${prevY}, ${cpX2} ${y}, ${x} ${y}`;
                        })
                        .join(' ');
                    const areaD = `${pathD} L 950 120 L 50 120 Z`;
                    return (
                      <>
                        <path d={areaD} fill="url(#eqCurveGradient)" />
                        <path
                          d={pathD}
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </>
                    );
                  })()}

                  {/* Precision Control Nodes */}
                  {eqGains.map((gain, idx) => {
                    const x = 50 + idx * 100;
                    const y = 60 - ((isEqEnabled ? gain : 0) / 12) * 50;
                    return (
                      <g key={`node-${idx}`}>
                        <circle
                          cx={x}
                          cy={y}
                          r="4"
                          className={`${
                            isEqEnabled
                              ? 'fill-foreground stroke-primary'
                              : 'fill-muted-foreground stroke-border'
                          }`}
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* 10 Vertical Fader Channels */}
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 bg-secondary/20 border border-border/70 rounded-xl p-3">
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = eqGains[idx];
                const label = EQ_LABELS[idx];
                const bandName = EQ_BAND_NAMES[idx];

                return (
                  <div
                    key={freq}
                    className="flex flex-col items-center justify-between space-y-2 p-2 rounded-lg bg-card/60 border border-border/60 hover:border-border transition group"
                  >
                    {/* Gain dB Readout */}
                    <div
                      className={`font-mono text-[11px] transition ${
                        !isEqEnabled
                          ? 'text-muted-foreground'
                          : gain !== 0
                          ? 'text-foreground font-semibold'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
                      <span className="text-[9px] text-muted-foreground ml-0.5">dB</span>
                    </div>

                    {/* Vertical Slider Track Container */}
                    <div className="relative h-32 w-full flex items-center justify-center py-1">
                      {/* Zero dB Center Reference Line */}
                      <div className="absolute w-6 h-[1px] bg-border top-1/2 -translate-y-1/2 pointer-events-none" />

                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        disabled={!isEqEnabled}
                        onChange={(e) => handleEqBandChange(idx, parseFloat(e.target.value))}
                        className="h-1.5 w-28 -rotate-90 accent-primary cursor-pointer bg-secondary rounded-lg disabled:opacity-40 transition"
                        style={{ touchAction: 'none' }}
                        title={`${label} (${bandName}): ${gain > 0 ? `+${gain}` : gain} dB`}
                      />
                    </div>

                    {/* Frequency & Band Name */}
                    <div className="text-center pt-1.5 w-full border-t border-border/40">
                      <div className="font-mono text-[11px] font-semibold text-foreground group-hover:text-primary transition">
                        {label}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate w-full" title={bandName}>
                        {bandName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Studio EQ Presets Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 text-xs">
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                <span className="text-[11px] text-muted-foreground mr-1 shrink-0 font-medium">
                  Presets:
                </span>
                {Object.entries(EQ_PRESETS).map(([key, preset]) => {
                  const isActive = activeEqPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleApplyEqPreset(key)}
                      title={preset.desc}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold border-primary shadow-xs'
                          : 'bg-secondary/70 text-muted-foreground border-border hover:text-foreground hover:bg-secondary'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              <div className="text-[10px] text-muted-foreground sm:text-right shrink-0">
                <span>Range: </span>
                <strong className="text-foreground font-mono">-12 dB</strong>
                <span> to </span>
                <strong className="text-foreground font-mono">+12 dB</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. INDEPENDENT OUTPUT CARDS FOR ALL CONNECTED BOTS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Active Discord Bot Outputs ({outputCards.length})</span>
            </h2>
            {outputCards.some((c) => c.state === 'disconnected' || c.state === 'failed') && (
              <button
                type="button"
                onClick={handleReconnectAllDisconnected}
                className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 rounded-md font-medium flex items-center gap-1.5 transition cursor-pointer"
                title="Reconnect all disconnected bots to the voice channel"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  Reconnect All Failed (
                  {outputCards.filter((c) => c.state === 'disconnected' || c.state === 'failed').length}
                  )
                </span>
              </button>
            )}
          </div>
          {sessionState === 'streaming' && (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Streaming {audioSourceMode === 'music' ? 'Tab / Music' : audioSourceMode === 'dj' ? 'Voice & Music' : 'Voice'} at {Math.round(masterGain * 100)}% Volume
              </span>
            </span>
          )}
        </div>

        {outputCards.length === 0 ? (
          <div className="p-10 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            No active bot channels transmitting. Set your Voice Channel ID above, select your bots, and click &quot;Stream to All Bots&quot;.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {outputCards.map((card) => (
              <div
                key={card.endpointId}
                className="bg-card border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-3.5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate">
                      <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                        <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="truncate">{card.botName}</span>
                      </h3>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        #{card.channelName} • {card.guildName}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border transition shrink-0 ${
                        card.state === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : card.state === 'reconnecting'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : card.state === 'muted'
                          ? 'bg-secondary text-muted-foreground border-border'
                          : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}
                    >
                      {card.state}
                    </span>
                  </div>

                  {/* Per-Output VU Meter */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Signal Activity</span>
                      <span className="font-mono">{card.vuLevel}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-75"
                        style={{ width: `${card.vuLevel}%` }}
                      />
                    </div>
                  </div>

                  {/* Per-Output Gain */}
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Bot Gain Level</span>
                      <span className="font-mono font-semibold text-foreground">
                        {Math.round(card.gain * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={card.gain}
                      onChange={(e) =>
                        handleOutputGainChange(card.endpointId, parseFloat(e.target.value))
                      }
                      className="w-full accent-primary cursor-pointer h-1 bg-secondary rounded-lg"
                    />
                  </div>
                </div>

                {/* Per-Output Controls */}
                <div className="pt-2.5 border-t border-border/50 flex items-center justify-between gap-2 text-xs">
                  <button
                    onClick={() => handleOutputMuteToggle(card.endpointId)}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                      card.muted
                        ? 'bg-destructive/15 text-destructive border-destructive/30'
                        : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                    }`}
                  >
                    {card.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    <span>{card.muted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={card.state === 'reconnecting'}
                      onClick={() => handleReconnectEndpoint(card.endpointId)}
                      className={`flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                        card.state === 'disconnected' || card.state === 'failed'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                      }`}
                      title="Reconnect this bot to the voice channel"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          card.state === 'reconnecting' ? 'animate-spin text-amber-400' : ''
                        }`}
                      />
                      <span>{card.state === 'reconnecting' ? 'Reconnecting...' : 'Reconnect'}</span>
                    </button>

                    <button
                      onClick={async () => {
                        if (currentSessionId) {
                          try {
                            await fetch(
                              `/api/voice-sessions/${currentSessionId}/endpoints/${card.endpointId}`,
                              { method: 'DELETE' }
                            );
                          } catch {}
                        }
                        setOutputCards((prev) =>
                          prev.filter((c) => c.endpointId !== card.endpointId)
                        );
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition px-1.5 py-1 cursor-pointer"
                      title="Disconnect bot"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

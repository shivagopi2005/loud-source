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
  const [activeDeckTab, setActiveDeckTab] = useState<'music' | 'mic'>('music');

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
            b.displayName !== 'Integration Test Bot'
        );

        setGuildsList(guilds);
        setBotsList(readyBots);

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
                id: `${bot.id}_${ch.id}`,
                botId: bot.id,
                botName: bot.displayName,
                guildId: guild.id || guild.guildId,
                guildName: guild.displayName,
                channelId: ch.id || ch.channelId,
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
    setSelectedFleetGuildId(guildIdOrUuid);
    setManualGuildId(guildIdOrUuid);
    const targetGuild = guildsList.find(
      (g) => g.id === guildIdOrUuid || g.guildId === guildIdOrUuid
    );
    if (targetGuild) {
      const voiceChannels = (targetGuild.channels || []).filter(
        (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
      );
      if (voiceChannels.length > 0) {
        setSelectedFleetChannelId(voiceChannels[0].id || voiceChannels[0].channelId);
      } else {
        setSelectedFleetChannelId('');
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
        ws.send(pcm16.buffer);

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
            return d.liveGuildIds.includes(d.guildId);
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

      const sessionRes = await fetch('/api/voice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      });

      const sessionJson = await sessionRes.json();
      if (!sessionRes.ok) {
        throw new Error(sessionJson.error?.message || 'Failed to create voice session');
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-primary" />
            <span>Live Voice &amp; Music Studio</span>
            <span
              className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                sessionState === 'streaming'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}
            >
              {sessionState === 'streaming' ? 'Live Transmitting' : 'Studio Standby'}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Connect all Discord bots to your chosen channel with up to 10000% volume and broadcast your voice, Spotify, and YouTube Music live.
          </p>
        </div>

        {/* Master Controls & Global Emergency Stop */}
        <div className="flex items-center space-x-3">
          {sessionState === 'streaming' ? (
            <button
              onClick={handleStopSession}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border shadow-sm transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Audio Stream</span>
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
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sessionState === 'connecting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Connecting Bots to Channel...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {routingMode === 'fleet'
                      ? audioSourceMode === 'music'
                        ? `Stream Spotify / Music to All (${selectedFleetBotIds.length}) Bots`
                        : audioSourceMode === 'dj'
                        ? `Stream Voice & Music to All (${selectedFleetBotIds.length}) Bots`
                        : `Stream Voice to All (${selectedFleetBotIds.length}) Bots`
                      : 'Start Transmission'}
                  </span>
                </>
              )}
            </button>
          )}

          <button
            onClick={triggerEmergencyStop}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-lg bg-destructive hover:bg-destructive/90 text-white font-bold text-xs uppercase shadow-lg shadow-destructive/20 transition active:scale-95"
          >
            <AlertOctagon className="w-4 h-4" />
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
        {/* 1. INPUT MIXER & MUSIC BRIDGE SECTION */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          {/* Deck Source Switcher */}
          <div className="flex bg-secondary/80 p-1 rounded-xl text-xs border border-border">
            <button
              type="button"
              onClick={() => {
                handleAudioSourceModeChange('dj');
                setActiveDeckTab('music');
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
                audioSourceMode === 'dj'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>DJ Studio</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleAudioSourceModeChange('music');
                setActiveDeckTab('music');
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
                audioSourceMode === 'music'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Music Only</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleAudioSourceModeChange('mic');
                setActiveDeckTab('mic');
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
                audioSourceMode === 'mic'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Mic Only</span>
            </button>
          </div>

          {/* Sub-Deck Switcher Tabs (Spotify vs Mic) */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex space-x-1.5">
              <button
                type="button"
                onClick={() => setActiveDeckTab('music')}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                  activeDeckTab === 'music'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Spotify / YouTube</span>
                {isMusicConnected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveDeckTab('mic')}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 ${
                  activeDeckTab === 'mic'
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Microphone</span>
              </button>
            </div>

            {activeDeckTab === 'music' ? (
              <button
                type="button"
                onClick={toggleMusicMute}
                disabled={!isMusicConnected}
                className={`p-1.5 rounded-lg border text-xs font-medium transition ${
                  isMusicMuted
                    ? 'bg-destructive/20 text-destructive border-destructive/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40'
                }`}
                title={isMusicMuted ? 'Unmute Music Bridge' : 'Mute Music Bridge'}
              >
                {isMusicMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMicMute}
                className={`p-1.5 rounded-lg border text-xs font-medium transition ${
                  isMicMuted
                    ? 'bg-destructive/20 text-destructive border-destructive/30'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* DECK A: SPOTIFY & YOUTUBE MUSIC AUDIO BRIDGE */}
          {activeDeckTab === 'music' ? (
            <div className="space-y-4">
              {/* Main Connect Action */}
              {!isMusicConnected ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleConnectMusicCapture}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 group cursor-pointer"
                    >
                      <Cast className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span>Connect Spotify / YouTube Audio</span>
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Captures live audio from Spotify, YouTube, YouTube Music, or any browser tab.
                    </p>
                  </div>

                  {/* Browser Tab Capture Instructions */}
                  <div className="bg-background/60 border border-border/80 rounded-xl p-2.5 space-y-1.5 text-[11px]">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>How to Stream YouTube & Spotify Live:</span>
                    </div>
                    <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 leading-relaxed text-[10px]">
                      <li>Open <strong className="text-foreground">YouTube</strong> or <strong className="text-foreground">Spotify</strong> in a browser tab.</li>
                      <li>Click <strong className="text-emerald-400">"Connect Spotify / YouTube Audio"</strong> above.</li>
                      <li>In the browser popup, choose the <strong className="text-foreground">"Chrome Tab"</strong> tab.</li>
                      <li>Ensure <strong className="text-foreground">"Also share tab audio"</strong> is checked!</li>
                    </ol>
                  </div>

                  {/* Instant Bot Sound Verification */}
                  <div className="pt-2 border-t border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                        <span>Instant Bot Sound Verification</span>
                      </span>
                      {isPlayingTestChime && (
                        <span className="text-[10px] text-emerald-400 font-mono animate-pulse">● Sound Playing</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleTestChime}
                      className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition shadow-md cursor-pointer ${
                        isPlayingTestChime
                          ? 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive/30'
                          : 'bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-purple-500/30 text-purple-200 border-purple-500/40 hover:border-purple-400'
                      }`}
                    >
                      {isPlayingTestChime ? (
                        <>
                          <VolumeX className="w-4 h-4" />
                          <span>Stop Test Melody</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 text-purple-300" />
                          <span>▶ Play Test Melody (Verify Bot Sound Now)</span>
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center">
                      Streams a harmonic chime directly through all 15 bots to immediately verify Discord voice output.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <div className="flex-1 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-semibold flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">{musicSourceName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDisconnectMusicCapture}
                    className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground text-xs font-semibold border border-border transition"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* Error Notice */}
              {musicError && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-[11px] text-destructive space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Audio Sharing Notice</span>
                  </div>
                  <div>{musicError}</div>
                </div>
              )}

              {/* Music VU Meter */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Music Audio Activity</span>
                  </span>
                  <span className="font-mono text-[11px] text-foreground">{musicVuLevel}%</span>
                </div>
                <div className="h-3 w-full bg-secondary/80 rounded-full overflow-hidden p-0.5 border border-border">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      musicVuLevel > 80
                        ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                        : musicVuLevel > 40
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${isMusicConnected ? musicVuLevel : 0}%` }}
                  />
                </div>
              </div>

              {/* Music Pre-Amp Booster Slider (0% - 10000% volume) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground flex items-center gap-1">
                    <span>Music Pre-Amp Booster</span>
                    {musicGain >= 99.9 && (
                      <span className="text-[9px] bg-red-600/30 text-red-400 font-bold px-1 rounded border border-red-500/40">
                        10000% NUKE
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-foreground">
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
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex items-center space-x-1 text-[10px] overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => handleSetMusicGain(1.0)}
                    className={`px-1.5 py-0.5 rounded border transition ${
                      Math.round(musicGain * 100) === 100
                        ? 'bg-emerald-600 text-white font-bold border-emerald-500'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetMusicGain(2.0)}
                    className={`px-1.5 py-0.5 rounded border transition ${
                      Math.round(musicGain * 100) === 200
                        ? 'bg-emerald-600 text-white font-bold border-emerald-500'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    200%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetMusicGain(5.0)}
                    className={`px-1.5 py-0.5 rounded border transition ${
                      Math.round(musicGain * 100) === 500
                        ? 'bg-emerald-600 text-white font-bold border-emerald-500'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    500%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetMusicGain(10.0)}
                    className={`px-1.5 py-0.5 rounded border transition font-bold ${
                      Math.round(musicGain * 100) === 1000
                        ? 'bg-orange-600 text-white border-orange-500'
                        : 'bg-secondary text-orange-400 hover:text-orange-300'
                    }`}
                  >
                    1000%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetMusicGain(100.0)}
                    className={`px-1.5 py-0.5 rounded border transition font-bold ${
                      Math.round(musicGain * 100) === 10000
                        ? 'bg-red-600 text-white border-red-500 shadow-sm shadow-red-500/50 animate-pulse'
                        : 'bg-secondary text-red-400 border-red-500/40 hover:text-red-300'
                    }`}
                  >
                    10000% MAX
                  </button>
                </div>
              </div>

              {/* Quick Launch Streaming Sites */}
              <div className="space-y-1.5 pt-2 border-t border-border/40 text-[11px]">
                <span className="text-muted-foreground font-medium block">
                  Quick Open &amp; Bridge:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <a
                    href="https://music.youtube.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-semibold text-foreground transition"
                  >
                    <span>YT Music</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                  <a
                    href="https://open.spotify.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-400 transition"
                  >
                    <span>Spotify</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                  <a
                    href="https://www.youtube.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1.5 rounded-lg bg-secondary/80 hover:bg-secondary border border-border flex items-center justify-center gap-1 text-[11px] font-semibold text-red-400 transition"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight pt-1">
                  Tip: In the screen share prompt, choose <strong>Chrome Tab</strong> &gt; select your tab &gt; ensure <strong>&quot;Also share tab audio&quot;</strong> is checked.
                </p>
              </div>

              {/* Local MP3 / WAV Player Sub-Card (100% Muted in Browser, Direct to Bots) */}
              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                    <FileAudio className="w-3.5 h-3.5 text-purple-400" />
                    <span>Local Audio File Player</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Muted in Web • Direct to Bots
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition shadow-sm"
                    >
                      {currentFileName ? 'Replace File' : 'Choose Audio File'}
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="audio/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {isFileLoading ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground bg-background/50 rounded-lg border border-border">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Decoding audio file into memory...</span>
                  </div>
                ) : currentFileName ? (
                  <div className="space-y-2.5 bg-background/80 p-2.5 rounded-lg border border-border text-xs">
                    {/* Track info header */}
                    <div className="flex items-center justify-between">
                      <span className="truncate max-w-[220px] font-mono text-[11px] font-semibold text-foreground">
                        {currentFileName}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        <strong className="text-foreground">{formatAudioTime(fileCurrentTime)}</strong>
                        <span className="mx-1">/</span>
                        <span>{formatAudioTime(fileDuration)}</span>
                      </span>
                    </div>

                    {/* Seek Slider (Progress Scrubber) */}
                    <div className="space-y-1">
                      <input
                        type="range"
                        min="0"
                        max={fileDuration || 100}
                        step="0.1"
                        value={fileCurrentTime}
                        onChange={(e) => handleSeekFile(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-secondary rounded-lg accent-purple-500 cursor-pointer"
                        title={`Seek: ${formatAudioTime(fileCurrentTime)}`}
                      />
                    </div>

                    {/* Playback Action Buttons: Play/Pause, Loop, Delete */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <div className="flex items-center space-x-2">
                        {/* Play / Pause Toggle Button */}
                        <button
                          type="button"
                          onClick={handleTogglePlayFile}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-bold text-xs transition shadow-sm ${
                            isPlayingFile
                              ? 'bg-amber-500 hover:bg-amber-400 text-black'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                          title={isPlayingFile ? 'Pause Track' : 'Play to Discord Bots'}
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

                        {/* Loop Toggle Button */}
                        <button
                          type="button"
                          onClick={handleToggleFileLoop}
                          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition ${
                            isFileLooping
                              ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-sm'
                              : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                          }`}
                          title={isFileLooping ? 'Looping Enabled (Click to Disable)' : 'Looping Disabled (Click to Enable)'}
                        >
                          <Repeat className="w-3.5 h-3.5" />
                          <span>{isFileLooping ? 'Loop: ON' : 'Loop: OFF'}</span>
                        </button>
                      </div>

                      {/* Delete File Button */}
                      <button
                        type="button"
                        onClick={handleDeleteFile}
                        className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition"
                        title="Delete loaded file and reset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground bg-background/30 p-2.5 rounded-lg border border-dashed border-border flex items-center justify-between">
                    <span>Upload an MP3, WAV, or audio file to stream strictly to Discord bots.</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-semibold text-primary hover:underline ml-2 shrink-0"
                    >
                      Browse...
                    </button>
                  </div>
                )}

                {/* Instant Discord Bot Streaming Action & Status */}
                {(currentFileName || isMusicConnected) && (
                  <div className="pt-1">
                    {sessionState === 'connecting' ? (
                      <div className="py-2 px-3 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Connecting All Fleet Bots to Voice Channel...</span>
                      </div>
                    ) : sessionState !== 'streaming' ? (
                      <button
                        type="button"
                        onClick={handleStartSession}
                        disabled={sessionState === 'stopping'}
                        className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Radio className="w-3.5 h-3.5 animate-pulse" />
                        <span>Stream Audio to All Discord Bots Now</span>
                      </button>
                    ) : (
                      <div className="py-1.5 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Live on Discord: Streaming through all bots ({Math.round(masterGain * 100)}% vol)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* DECK B: MICROPHONE & VOICE INGEST */
            <div className="space-y-4">
              {/* Device Selector */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Microphone Input</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={sessionState === 'streaming'}
                  className="w-full bg-secondary/60 border border-border rounded-lg text-xs px-3 py-2 text-foreground outline-none disabled:opacity-50"
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

              {/* Live Input VU Meter */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-muted-foreground">Speech Input Level</span>
                  <span className="font-mono text-[11px] text-foreground">{inputVuLevel}%</span>
                </div>
                <div className="h-3 w-full bg-secondary/80 rounded-full overflow-hidden p-0.5 border border-border">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      inputVuLevel > 85
                        ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-destructive'
                        : inputVuLevel > 50
                        ? 'bg-gradient-to-r from-emerald-500 to-amber-400'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${inputVuLevel}%` }}
                  ></div>
                </div>
              </div>

              {/* Input Gain Slider */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-muted-foreground">Pre-Amp Input Gain</span>
                  <span className="font-mono text-[11px] text-foreground">{Math.round(inputGain * 100)}%</span>
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
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Studio Filters & Switches */}
              <div className="space-y-2.5 pt-2 border-t border-border/40 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-foreground">Noise Suppression</span>
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => setNoiseSuppression(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-foreground">High-Pass Filter (80Hz Cut)</span>
                  <input
                    type="checkbox"
                    checked={highPassFilter}
                    onChange={(e) => setHighPassFilter(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-foreground">Dynamics Compressor</span>
                  <input
                    type="checkbox"
                    checked={compressorEnabled}
                    onChange={(e) => setCompressorEnabled(e.target.checked)}
                    className="rounded accent-primary w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-foreground">Local Audio Preview Monitor</span>
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
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Fleet Voice Channel Connector</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Route your microphone voice to all Discord bots connected to a single channel.
                </p>
              </div>

              {/* Routing Mode Tabs */}
              <div className="flex bg-secondary p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setRoutingMode('fleet')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    routingMode === 'fleet'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Bots in Channel
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode('custom')}
                  className={`px-3 py-1 rounded-md font-semibold transition ${
                    routingMode === 'custom'
                      ? 'bg-primary text-primary-foreground shadow-sm'
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
                {/* Server & Channel Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* TARGET DISCORD SERVER ID */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-primary" />
                        <span>Target Server ID (Guild ID)</span>
                      </label>

                      {/* Mode toggle */}
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setGuildInputMode('manual')}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            guildInputMode === 'manual'
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Manual ID
                        </button>
                        <button
                          type="button"
                          onClick={() => setGuildInputMode('dropdown')}
                          disabled={guildsList.length === 0}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            guildInputMode === 'dropdown'
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                          }`}
                        >
                          List ({guildsList.length})
                        </button>
                      </div>
                    </div>

                    {/* MANUAL GUILD ID OR DROPDOWN */}
                    {guildInputMode === 'manual' || guildsList.length === 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="text"
                            placeholder="Paste Discord Server ID (e.g. 1499406517470756955)..."
                            value={manualGuildId}
                            onChange={(e) => setManualGuildId(e.target.value)}
                            disabled={sessionState === 'streaming'}
                            className="flex-1 bg-secondary/80 border border-primary/50 focus:border-primary rounded-lg px-3 py-2 text-foreground font-mono outline-none text-xs shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={handlePasteGuildId}
                            disabled={sessionState === 'streaming'}
                            title="Paste Server ID from clipboard"
                            className="px-2.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1"
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>Paste</span>
                          </button>
                        </div>
                        <div className="text-[11px] text-muted-foreground px-0.5">
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
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none disabled:opacity-50"
                      >
                        {guildsList.map((g) => (
                          <option key={g.id || g.guildId} value={g.id || g.guildId}>
                            {g.displayName} ({g.guildId || g.id})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* TARGET VOICE CHANNEL ID */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Target Voice Channel ID</span>
                      </label>

                      {/* Mode toggle */}
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setChannelInputMode('manual')}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            channelInputMode === 'manual'
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          Manual ID
                        </button>
                        <button
                          type="button"
                          onClick={() => setChannelInputMode('dropdown')}
                          disabled={currentFleetVoiceChannels.length === 0}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                            channelInputMode === 'dropdown'
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground disabled:opacity-40'
                          }`}
                        >
                          List ({currentFleetVoiceChannels.length})
                        </button>
                      </div>
                    </div>

                    {/* MANUAL INPUT MODE (USER REQUEST: add manually channel id and click connect) */}
                    {channelInputMode === 'manual' || currentFleetVoiceChannels.length === 0 ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="text"
                            placeholder="Paste Discord Voice Channel ID (e.g. 1499406518313947284)..."
                            value={manualChannelId}
                            onChange={(e) => setManualChannelId(e.target.value)}
                            disabled={sessionState === 'streaming'}
                            className="flex-1 bg-secondary/80 border border-emerald-500/50 focus:border-emerald-400 rounded-lg px-3 py-2 text-foreground font-mono outline-none text-xs shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={handlePasteChannelId}
                            disabled={sessionState === 'streaming'}
                            title="Paste from clipboard"
                            className="px-2.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1"
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                            <span>Paste</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleAutoDetectChannels}
                            disabled={isDetectingChannels || sessionState === 'streaming'}
                            title="Auto-detect all voice channels in server"
                            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-primary hover:text-primary transition"
                          >
                            <Wand2 className={`w-3.5 h-3.5 ${isDetectingChannels ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
                          <span>Right-click voice channel in Discord &gt; &quot;Copy Channel ID&quot;</span>
                          {detectMsg && <span className="text-emerald-400 font-semibold">{detectMsg}</span>}
                        </div>

                        {/* Quick Channel Picker from detected/synced server */}
                        {currentFleetVoiceChannels.length > 0 && (
                          <div className="pt-1.5 space-y-1">
                            <span className="text-[10px] text-muted-foreground block font-medium">
                              Quick Pick Channel from {currentFleetGuild?.displayName || 'Server'}:
                            </span>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
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
                                    className={`text-[10px] px-2 py-0.5 rounded border transition flex items-center gap-1 ${
                                      isSelected
                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-bold'
                                        : 'bg-secondary/70 border-border text-foreground hover:bg-secondary'
                                    }`}
                                  >
                                    <span>🔊</span>
                                    <span>{ch.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* DROPDOWN MODE */
                      <select
                        value={selectedFleetChannelId}
                        onChange={(e) => setSelectedFleetChannelId(e.target.value)}
                        disabled={sessionState === 'streaming' || currentFleetVoiceChannels.length === 0}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none disabled:opacity-50"
                      >
                        {currentFleetVoiceChannels.map((ch: any) => (
                          <option key={ch.id || ch.channelId} value={ch.id || ch.channelId}>
                            🔊 {ch.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Fleet Bots Selector */}
                <div className="p-3.5 rounded-lg bg-secondary/40 border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                      <span>
                        Fleet Bots to Connect ({selectedFleetBotIds.length} of {botsList.length} Selected)
                      </span>
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleSelectAllFleetBots}
                        disabled={sessionState === 'streaming'}
                        className="text-[11px] text-primary hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllFleetBots}
                        disabled={sessionState === 'streaming'}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {botsList.length === 0 ? (
                    <div className="text-muted-foreground text-[11px] py-2">
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
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                              isSelected
                                ? 'bg-primary/10 border-primary/50 text-foreground'
                                : 'bg-background/60 border-border text-muted-foreground hover:bg-secondary/60'
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="rounded accent-primary w-3.5 h-3.5 shrink-0"
                              />
                              <span className="truncate font-medium">{bot.displayName}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Operational Status Pill */}
                  <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>
                      Target Destination:{' '}
                      <strong className="text-foreground">{effectiveChannelDisplayName}</strong> (
                      {currentFleetGuild?.displayName || 'Discord Server'})
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {selectedFleetBotIds.length} bots will join simultaneously
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* CUSTOM MATRIX MODE */
              <div className="space-y-2 text-xs">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
                  <span>Select Target Bots &amp; Voice Channels ({selectedDestinationIds.length} selected):</span>
                  <button
                    onClick={loadDestinations}
                    className="text-primary hover:underline text-[11px] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {availableDestinations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/30 rounded-lg">
                    No voice channels found. Please switch to &quot;All Bots in Channel&quot; mode above and paste your Discord Voice Channel ID directly.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableDestinations.map((dest) => {
                      const isSelected = selectedDestinationIds.includes(dest.id);
                      return (
                        <div
                          key={dest.id}
                          onClick={() => toggleDestinationSelection(dest.id)}
                          className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-primary/10 border-primary/50 text-foreground'
                              : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="rounded accent-primary w-4 h-4 shrink-0"
                            />
                            <div className="truncate">
                              <div className="font-semibold text-foreground truncate">{dest.channelName}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                Bot: {dest.botName} • {dest.guildName}
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

          {/* MASTER CONTROLS & UNIFIED VOLUME TO 1000% (USER REQUEST: make volume to 1000 where all bots need to work same volume) */}
          <div className="p-4 rounded-xl bg-secondary/40 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5 flex-1">
              <button
                onClick={() => setMasterMuted(!masterMuted)}
                className={`p-2.5 rounded-lg border transition ${
                  masterMuted
                    ? 'bg-destructive/20 text-destructive border-destructive/30'
                    : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                }`}
                title={masterMuted ? 'Unmute Master' : 'Mute Master'}
              >
                {masterMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <span>Unified Fleet Volume (All Bots):</span>
                    {masterGain >= 99.9 ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-600/30 text-red-400 font-extrabold px-1.5 py-0.5 rounded border border-red-500/50 shadow-sm shadow-red-500/30 animate-pulse">
                        <Flame className="w-3 h-3 fill-current text-red-400" />
                        <span>10000% NUKE</span>
                      </span>
                    ) : masterGain >= 9.9 ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-500/20 text-orange-400 font-bold px-1.5 py-0.5 rounded border border-orange-500/30">
                        <Flame className="w-3 h-3 fill-current text-orange-400" />
                        <span>1000% ULTRA LOUD</span>
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold ${
                      masterGain >= 99.9
                        ? 'text-red-500 animate-pulse font-extrabold'
                        : masterGain >= 9.9
                        ? 'text-orange-400 font-bold'
                        : 'text-emerald-400'
                    }`}
                  >
                    {Math.round(masterGain * 100)}%
                  </span>
                </div>

                {/* Slider up to 100.0 (10000% Volume) */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.5"
                  value={masterGain}
                  onChange={(e) => handleSetUnifiedGain(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-secondary rounded-lg"
                />

                {/* Unified Volume Quick Preset Buttons */}
                <div className="flex items-center space-x-1.5 pt-1 text-[11px] overflow-x-auto pb-0.5">
                  <span className="text-muted-foreground mr-1 shrink-0">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(1.0)}
                    className={`px-2 py-0.5 rounded border transition shrink-0 ${
                      Math.round(masterGain * 100) === 100
                        ? 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-sm'
                        : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    100% (Original)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(2.0)}
                    className={`px-2 py-0.5 rounded border transition shrink-0 ${
                      Math.round(masterGain * 100) === 200
                        ? 'bg-primary text-primary-foreground font-bold border-primary'
                        : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    200%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(5.0)}
                    className={`px-2 py-0.5 rounded border transition shrink-0 ${
                      Math.round(masterGain * 100) === 500
                        ? 'bg-primary text-primary-foreground font-bold border-primary'
                        : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    500%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(10.0)}
                    className={`px-2.5 py-0.5 rounded border font-bold transition flex items-center gap-1 shrink-0 ${
                      Math.round(masterGain * 100) === 1000
                        ? 'bg-orange-600 text-white border-orange-500 shadow-sm'
                        : 'bg-secondary text-orange-400 border-orange-500/30 hover:bg-orange-500/10'
                    }`}
                  >
                    <Flame className="w-3 h-3 fill-current text-orange-400" />
                    <span>1000%</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(100.0)}
                    className={`px-2.5 py-0.5 rounded border font-bold transition flex items-center gap-1 shrink-0 ${
                      Math.round(masterGain * 100) === 10000
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-500/40 animate-pulse'
                        : 'bg-secondary text-red-400 border-red-500/40 hover:bg-red-500/10'
                    }`}
                  >
                    <Flame className="w-3 h-3 fill-current text-red-400" />
                    <span>10000% (MAX)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground md:text-right border-t md:border-t-0 pt-2 md:pt-0 border-border/40 shrink-0">
              <div>Output Format: <strong className="text-foreground">PCM 48kHz Stereo (Studio Quality)</strong></div>
              <div>Broadcast Duration: <strong className="text-foreground font-mono">{sessionDurationSec}s</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 BIG STUDIO MASTER EQUALIZER RACK (Directly shapes frequency response for all 15 bots) */}
      <div className="bg-card/90 border border-border rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-4">
        {/* EQ Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border transition shadow-sm ${
              isEqEnabled
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-secondary border-border text-muted-foreground'
            }`}>
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground tracking-tight">
                  10-Band Master Studio Equalizer
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition ${
                  isEqEnabled
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}>
                  {isEqEnabled ? 'ACTIVE (DSP ENGAGED)' : 'BYPASSED'}
                </span>
                {activeEqPreset in EQ_PRESETS && (
                  <span className="hidden sm:inline-flex text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                    {EQ_PRESETS[activeEqPreset].name}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Shapes live sound streamed directly to all Discord bots with zero latency (Web Audio Biquad DSP)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Toggle Bypass */}
            <button
              type="button"
              onClick={handleToggleEq}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition ${
                isEqEnabled
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-500/20 hover:bg-emerald-500'
                  : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
              }`}
              title={isEqEnabled ? 'Bypass Equalizer' : 'Engage Equalizer'}
            >
              <Zap className={`w-3.5 h-3.5 ${isEqEnabled ? 'fill-current' : ''}`} />
              <span>{isEqEnabled ? 'EQ Active' : 'EQ Bypassed'}</span>
            </button>

            {/* Reset to Flat */}
            <button
              type="button"
              onClick={handleResetEq}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1.5 transition"
              title="Reset all bands to 0 dB Flat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset (0 dB)</span>
            </button>

            {/* Expand / Collapse toggle */}
            <button
              type="button"
              onClick={() => setIsEqExpanded(!isEqExpanded)}
              className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground border border-border transition"
              title={isEqExpanded ? 'Collapse Equalizer' : 'Expand Equalizer'}
            >
              {isEqExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isEqExpanded && (
          <div className="space-y-4 pt-1">
            {/* Real-Time Frequency Response Visualizer Curve */}
            <div className="relative rounded-xl bg-black/60 border border-border/60 p-3 overflow-hidden shadow-inner">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5 font-mono px-1">
                <span>FREQUENCY RESPONSE CURVE</span>
                <span className="flex items-center gap-3">
                  <span className="text-emerald-400 font-bold">+12 dB</span>
                  <span>0 dB</span>
                  <span className="text-sky-400 font-bold">-12 dB</span>
                </span>
              </div>

              <div className="h-24 w-full relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 1000 120"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="eqCurveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="eqLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="50%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  <line x1="30" y1="10" x2="970" y2="10" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                  <line x1="30" y1="35" x2="970" y2="35" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="30" y1="60" x2="970" y2="60" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <line x1="30" y1="85" x2="970" y2="85" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="30" y1="110" x2="970" y2="110" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />

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
                        stroke="rgba(255,255,255,0.04)"
                      />
                    );
                  })}

                  {/* Shaded Area */}
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
                          stroke="url(#eqLineGradient)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </>
                    );
                  })()}

                  {/* Control Nodes */}
                  {eqGains.map((gain, idx) => {
                    const x = 50 + idx * 100;
                    const y = 60 - ((isEqEnabled ? gain : 0) / 12) * 50;
                    return (
                      <g key={`node-${idx}`}>
                        <circle
                          cx={x}
                          cy={y}
                          r="4.5"
                          className={`${
                            isEqEnabled
                              ? gain > 0
                                ? 'fill-emerald-400 stroke-emerald-950'
                                : gain < 0
                                ? 'fill-sky-400 stroke-sky-950'
                                : 'fill-muted-foreground stroke-background'
                              : 'fill-muted stroke-border'
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
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-2.5 bg-black/40 border border-border/50 rounded-xl p-3 sm:p-4">
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = eqGains[idx];
                const label = EQ_LABELS[idx];
                const bandName = EQ_BAND_NAMES[idx];

                return (
                  <div
                    key={freq}
                    className="flex flex-col items-center justify-between space-y-2 p-2 rounded-lg bg-card/40 border border-border/40 hover:border-emerald-500/40 transition group"
                  >
                    {/* Gain dB Readout */}
                    <div
                      className={`font-mono text-[11px] font-bold transition ${
                        !isEqEnabled
                          ? 'text-muted-foreground'
                          : gain > 0
                          ? 'text-emerald-400'
                          : gain < 0
                          ? 'text-sky-400'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)}
                      <span className="text-[9px] text-muted-foreground ml-0.5">dB</span>
                    </div>

                    {/* Vertical Slider Track Container */}
                    <div className="relative h-36 w-full flex items-center justify-center py-1">
                      {/* Zero dB Center Reference Line */}
                      <div className="absolute w-8 h-[1px] bg-white/20 top-1/2 -translate-y-1/2 pointer-events-none" />

                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        disabled={!isEqEnabled}
                        onChange={(e) => handleEqBandChange(idx, parseFloat(e.target.value))}
                        className="h-2 w-32 -rotate-90 accent-emerald-500 cursor-pointer bg-secondary rounded-lg disabled:opacity-40 transition"
                        style={{ touchAction: 'none' }}
                        title={`${label} (${bandName}): ${gain > 0 ? `+${gain}` : gain} dB`}
                      />
                    </div>

                    {/* Frequency & Band Name */}
                    <div className="text-center pt-1 w-full border-t border-border/30">
                      <div className="font-mono text-xs font-bold text-foreground group-hover:text-emerald-400 transition">
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

            {/* Studio EQ Presets */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-xs text-muted-foreground mr-1 shrink-0 font-medium flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Presets:</span>
                </span>
                {Object.entries(EQ_PRESETS).map(([key, preset]) => {
                  const isActive = activeEqPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleApplyEqPreset(key)}
                      title={preset.desc}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition shrink-0 ${
                        isActive
                          ? 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-sm shadow-emerald-500/20'
                          : 'bg-secondary text-muted-foreground border-border hover:text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              <div className="text-[11px] text-muted-foreground sm:text-right shrink-0">
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
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Active Discord Bot Voice Outputs ({outputCards.length})</span>
            </h2>
            {outputCards.some((c) => c.state === 'disconnected' || c.state === 'failed') && (
              <button
                type="button"
                onClick={handleReconnectAllDisconnected}
                className="text-xs px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 rounded-lg font-bold flex items-center gap-1.5 transition shadow-sm animate-pulse"
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
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
              <Disc className="w-3.5 h-3.5 fill-current" />
              <span>
                Broadcasting {audioSourceMode === 'music' ? 'Spotify / YouTube Music' : audioSourceMode === 'dj' ? 'Voice & Music (DJ Studio)' : 'Voice'} Live at {Math.round(masterGain * 100)}% Volume
              </span>
            </span>
          )}
        </div>

        {outputCards.length === 0 ? (
          <div className="p-12 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            No active bots transmitting. Paste your Voice Channel ID above, select your bots, and click &quot;Stream to All Bots&quot;.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outputCards.map((card) => (
              <div
                key={card.endpointId}
                className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-primary" />
                        <span>{card.botName}</span>
                      </h3>
                      <div className="text-[11px] text-muted-foreground">
                        Channel: <strong>{card.channelName}</strong> • {card.guildName}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border transition ${
                        card.state === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : card.state === 'reconnecting'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                          : card.state === 'muted'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-destructive/10 text-destructive border-destructive/30'
                      }`}
                    >
                      {card.state}
                    </span>
                  </div>

                  {/* Per-Output VU Meter */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground">
                      <span>Audio Output Activity</span>
                      <span className="font-mono">{card.vuLevel}%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden p-0.5">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-75"
                        style={{ width: `${card.vuLevel}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Per-Output Gain up to 10000% */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground">
                      <span>Bot Output Volume</span>
                      <span className="font-mono font-bold text-foreground">{Math.round(card.gain * 100)}%</span>
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
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>

                {/* Per-Output Controls */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOutputMuteToggle(card.endpointId)}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                      card.muted
                        ? 'bg-destructive/20 text-destructive border-destructive/30'
                        : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                    }`}
                  >
                    {card.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{card.muted ? 'Unmute' : 'Mute'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Reconnect Option on each single bot */}
                    <button
                      type="button"
                      disabled={card.state === 'reconnecting'}
                      onClick={() => handleReconnectEndpoint(card.endpointId)}
                      className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                        card.state === 'disconnected' || card.state === 'failed'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 shadow-sm animate-pulse'
                          : card.state === 'reconnecting'
                          ? 'bg-secondary text-muted-foreground border-border cursor-wait'
                          : 'bg-secondary text-muted-foreground border-border hover:text-foreground hover:bg-secondary/80'
                      }`}
                      title="Reconnect this bot to the voice channel"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
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
                      className="text-xs text-muted-foreground hover:text-destructive transition px-1.5 py-1"
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

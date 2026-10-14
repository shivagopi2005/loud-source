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

export default function LiveVoiceStudioPage() {
  const { currentWorkspace, triggerEmergencyStop, activeVoiceSession, setActiveVoiceSession } =
    useWorkspace();

  // Audio hardware & processing state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [inputGain, setInputGain] = useState<number>(1.0);
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [highPassFilter, setHighPassFilter] = useState<boolean>(true);
  const [compressorEnabled, setCompressorEnabled] = useState<boolean>(true);
  const [previewAudio, setPreviewAudio] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [inputVuLevel, setInputVuLevel] = useState<number>(0);

  // Raw fetched data
  const [guildsList, setGuildsList] = useState<any[]>([]);
  const [botsList, setBotsList] = useState<any[]>([]);

  // Fleet Channel Connector Panel state
  const [routingMode, setRoutingMode] = useState<'fleet' | 'custom'>('fleet');
  const [selectedFleetGuildId, setSelectedFleetGuildId] = useState<string>('');
  const [selectedFleetChannelId, setSelectedFleetChannelId] = useState<string>('');
  const [manualChannelId, setManualChannelId] = useState<string>('');
  const [channelInputMode, setChannelInputMode] = useState<'dropdown' | 'manual'>('manual');
  const [selectedFleetBotIds, setSelectedFleetBotIds] = useState<string[]>([]);
  const [isDetectingChannels, setIsDetectingChannels] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  // Custom matrix destinations
  const [availableDestinations, setAvailableDestinations] = useState<VoiceDestination[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);

  // Session state (Default Master Gain set to 10.0 = 1000% volume for ultra-loud broadcasting)
  const [sessionState, setSessionState] = useState<
    'idle' | 'awaiting_start' | 'connecting' | 'streaming' | 'stopping' | 'stopped'
  >('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [outputCards, setOutputCards] = useState<OutputCardState[]>([]);
  const [masterGain, setMasterGain] = useState<number>(10.0); // 1000% volume default
  const [masterMuted, setMasterMuted] = useState<boolean>(false);
  const [sessionDurationSec, setSessionDurationSec] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(24);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio Context and Stream References
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const masterGainRef = useRef<number>(10.0);

  useEffect(() => {
    masterGainRef.current = masterGain;
  }, [masterGain]);

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
          (b: any) => b.status === 'ready' || b.status === 'connected' || b.online
        );

        setGuildsList(guilds);
        setBotsList(readyBots);

        // Auto-select first guild for fleet mode
        if (guilds.length > 0) {
          const targetGuild =
            guilds.find((g: any) => g.id === selectedFleetGuildId || g.guildId === selectedFleetGuildId) ||
            guilds[0];
          setSelectedFleetGuildId(targetGuild.id || targetGuild.guildId);

          const voiceChannels = (targetGuild.channels || []).filter(
            (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
          );

          if (voiceChannels.length > 0) {
            if (!selectedFleetChannelId) {
              setSelectedFleetChannelId(voiceChannels[0].id || voiceChannels[0].channelId);
            }
          } else {
            // Default to manual mode if no voice channels configured
            setChannelInputMode('manual');
          }
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

  // Auto-detect server voice channels
  const handleAutoDetectChannels = async () => {
    if (!currentWorkspace || !selectedFleetGuildId) return;
    setIsDetectingChannels(true);
    setDetectMsg(null);
    try {
      const targetGuild = guildsList.find(
        (g) => g.id === selectedFleetGuildId || g.guildId === selectedFleetGuildId
      );
      const rawGuildId = targetGuild?.guildId || selectedFleetGuildId;

      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/guilds/bulk-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guildId: rawGuildId,
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

  // Set unified volume for ALL bots simultaneously (supports up to 1000% volume)
  const handleSetUnifiedGain = (newGain: number) => {
    const clamped = Math.max(0, Math.min(10.0, newGain));
    setMasterGain(clamped);

    // Apply to all output cards so every bot works at the exact same volume
    setOutputCards((prev) => prev.map((c) => ({ ...c, gain: clamped })));

    // Send SET_MASTER_GAIN to MediaGateway to sync all Discord bot players
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_MASTER_GAIN', gain: clamped }));
    }
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

  // Current active guild and channels for Fleet mode
  const currentFleetGuild = guildsList.find(
    (g) => g.id === selectedFleetGuildId || g.guildId === selectedFleetGuildId
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

  // START VOICE SESSION & BROADCAST MICROPHONE TO ALL BOTS AT UNIFIED VOLUME
  const handleStartSession = async () => {
    if (!currentWorkspace) return;
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
      if (!currentFleetGuild) {
        setErrorMsg('Please select a Target Discord Server.');
        return;
      }

      if (!effectiveChannelId) {
        setErrorMsg('Please enter or select a Target Voice Channel ID.');
        return;
      }

      if (selectedFleetBotIds.length === 0) {
        setErrorMsg('Please select at least one Discord Bot to connect.');
        return;
      }

      targetDestinations = selectedFleetBotIds.map((bId) => {
        const bot = botsList.find((b) => b.id === bId);
        return {
          botId: bId,
          botName: bot?.displayName || 'Discord Bot',
          guildId: currentFleetGuild.id || currentFleetGuild.guildId,
          guildName: currentFleetGuild.displayName,
          channelId: effectiveChannelId,
          channelName: effectiveChannelDisplayName,
        };
      });
    } else {
      const selected = availableDestinations.filter((d) => selectedDestinationIds.includes(d.id));
      if (selected.length === 0) {
        setErrorMsg('Please select at least one voice destination.');
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
      // 1. Request Browser Microphone Access
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: noiseSuppression,
          autoGainControl: false,
          sampleRate: 48000,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // 2. Setup Web Audio API Processing Graph
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
      });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = inputGain;
      gainNodeRef.current = gainNode;

      // High-Pass Filter (80Hz rumble cut)
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = highPassFilter ? 80 : 20;

      // Dynamics Compressor
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
      compressor.knee.setValueAtTime(30, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(compressorEnabled ? 4 : 1, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

      // Analyser Node for Input VU Meter
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      // Connect graph
      source.connect(gainNode);
      gainNode.connect(highPass);
      highPass.connect(compressor);
      compressor.connect(analyser);

      if (previewAudio) {
        compressor.connect(audioCtx.destination);
      }

      // Live VU Meter loop
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
          inputGain: masterGain, // Send unified gain up to 10.0 (1000%)
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
        targetDestinations.map((d, idx) => ({
          endpointId: endpoints[idx]?.endpointId || `ep_${idx}`,
          botId: d.botId,
          botName: d.botName,
          channelName: d.channelName,
          guildName: d.guildName,
          state: 'connected',
          gain: masterGain, // exact same volume for every bot
          muted: false,
          vuLevel: 0,
        }))
      );

      // 4. Connect to Media Gateway WebSocket
      const wsUrl = `ws://${window.location.hostname}:3001?token=${mediaToken}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      // 5. ScriptProcessorNode for streaming amplified PCM Audio Chunks
      const bufferSize = 2048;
      const scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      compressor.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      scriptProcessor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMicMuted) {
          const inputChannel = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputChannel.length);

          // Apply master gain directly to amplify PCM frames (supports 1000% volume)
          const currentGain = masterGainRef.current;
          for (let i = 0; i < inputChannel.length; i++) {
            const sample = inputChannel[i] * currentGain;
            const clamped = Math.max(-1, Math.min(1, sample));
            pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          }
          ws.send(pcm16.buffer);
        }
      };

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
          } else if (msg.type === 'EMERGENCY_STOP_TRIGGERED') {
            handleLocalEmergencyHalt();
          }
        } catch {}
      };

      ws.onopen = async () => {
        await fetch(`/api/voice-sessions/${sessionId}/start`, { method: 'POST' });
        // Ensure Media Gateway sets all workers to masterGain immediately
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'SET_MASTER_GAIN', gain: masterGain }));
        }
        setSessionState('streaming');
        setActiveVoiceSession({ sessionId, state: 'streaming' });
      };

      ws.onerror = (err) => {
        console.warn('Media Gateway WebSocket error:', err);
      };
    } catch (err: any) {
      console.error('Start session error:', err);
      setErrorMsg(err.message || 'Microphone capture failed');
      handleStopSession();
    }
  };

  // STOP VOICE SESSION
  const handleStopSession = async () => {
    setSessionState('stopping');

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
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
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    setSessionState('stopped');
    setInputVuLevel(0);
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
            <span>Live Voice Studio</span>
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
            Connect all Discord bots to your chosen channel with up to 1000% volume and broadcast your voice live.
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
              <span>Stop Voice Stream</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={
                routingMode === 'fleet'
                  ? selectedFleetBotIds.length === 0 || !effectiveChannelId
                  : selectedDestinationIds.length === 0
              }
              className="flex items-center space-x-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {routingMode === 'fleet'
                  ? `Stream Voice to All (${selectedFleetBotIds.length}) Bots`
                  : 'Start Transmission'}
              </span>
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
        {/* 1. INPUT MIXER SECTION */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <span>Microphone &amp; Voice Ingest</span>
            </h2>
            <button
              onClick={() => setIsMicMuted(!isMicMuted)}
              className={`p-1.5 rounded-lg border text-xs font-medium transition ${
                isMicMuted
                  ? 'bg-destructive/20 text-destructive border-destructive/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

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
                  {/* TARGET DISCORD SERVER */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-primary" />
                      <span>Target Discord Server</span>
                    </label>
                    <select
                      value={selectedFleetGuildId}
                      onChange={(e) => handleFleetGuildChange(e.target.value)}
                      disabled={sessionState === 'streaming' || guildsList.length === 0}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none disabled:opacity-50"
                    >
                      {guildsList.length === 0 ? (
                        <option value="">No Servers Connected</option>
                      ) : (
                        guildsList.map((g) => (
                          <option key={g.id || g.guildId} value={g.id || g.guildId}>
                            {g.displayName}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* TARGET VOICE CHANNEL (DROPDOWN OR MANUAL CHANNEL ID) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Target Voice Channel</span>
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
                            placeholder="Paste Discord Voice Channel ID..."
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
                    {masterGain >= 9.9 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-500/20 text-red-400 font-bold px-1.5 py-0.2 rounded border border-red-500/30">
                        <Flame className="w-3 h-3 fill-current text-red-400" />
                        <span>MAX LOUD</span>
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold ${
                      masterGain >= 9.9 ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                    }`}
                  >
                    {Math.round(masterGain * 100)}%
                  </span>
                </div>

                {/* Slider up to 10.0 (1000% Volume) */}
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={masterGain}
                  onChange={(e) => handleSetUnifiedGain(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-secondary rounded-lg"
                />

                {/* Unified Volume Quick Preset Buttons */}
                <div className="flex items-center space-x-1.5 pt-1 text-[11px]">
                  <span className="text-muted-foreground mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(1.0)}
                    className={`px-2 py-0.5 rounded border transition ${
                      Math.round(masterGain * 100) === 100
                        ? 'bg-primary text-primary-foreground font-bold border-primary'
                        : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetUnifiedGain(2.0)}
                    className={`px-2 py-0.5 rounded border transition ${
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
                    className={`px-2 py-0.5 rounded border transition ${
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
                    className={`px-2.5 py-0.5 rounded border font-bold transition flex items-center gap-1 ${
                      Math.round(masterGain * 100) === 1000
                        ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-500/30'
                        : 'bg-secondary text-red-400 border-red-500/30 hover:bg-red-500/10'
                    }`}
                  >
                    <Flame className="w-3 h-3 fill-current" />
                    <span>1000% (MAX)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground md:text-right border-t md:border-t-0 pt-2 md:pt-0 border-border/40 shrink-0">
              <div>Output Format: <strong className="text-foreground">PCM 48kHz Mono</strong></div>
              <div>Broadcast Duration: <strong className="text-foreground font-mono">{sessionDurationSec}s</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INDEPENDENT OUTPUT CARDS FOR ALL CONNECTED BOTS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span>Active Discord Bot Voice Outputs ({outputCards.length})</span>
          </h2>
          {sessionState === 'streaming' && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
              <Disc className="w-3.5 h-3.5 fill-current" />
              <span>Broadcasting Live at {Math.round(masterGain * 100)}% Volume</span>
            </span>
          )}
        </div>

        {outputCards.length === 0 ? (
          <div className="p-12 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            No active bots transmitting. Paste your Voice Channel ID above, select your bots, and click &quot;Stream Voice to All Bots&quot;.
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
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        card.state === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : card.state === 'muted'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
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

                  {/* Per-Output Gain up to 1000% */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground">
                      <span>Bot Output Volume</span>
                      <span className="font-mono font-bold text-foreground">{Math.round(card.gain * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.1"
                      value={card.gain}
                      onChange={(e) =>
                        handleOutputGainChange(card.endpointId, parseFloat(e.target.value))
                      }
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>

                {/* Per-Output Controls */}
                <div className="pt-3 border-t border-border flex items-center justify-between">
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

                  <button
                    onClick={() => {
                      setOutputCards((prev) =>
                        prev.filter((c) => c.endpointId !== card.endpointId)
                      );
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive transition"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

  // Studio destinations & session state
  const [availableDestinations, setAvailableDestinations] = useState<VoiceDestination[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [sessionState, setSessionState] = useState<
    'idle' | 'awaiting_start' | 'connecting' | 'streaming' | 'stopping' | 'stopped'
  >('idle');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [outputCards, setOutputCards] = useState<OutputCardState[]>([]);
  const [masterGain, setMasterGain] = useState<number>(1.0);
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

        const destinations: VoiceDestination[] = [];
        const readyBots = (botsData.data || []).filter(
          (b: any) => b.status === 'ready' || b.status === 'connected'
        );

        for (const guild of guildsData.data || []) {
          const voiceChannels = (guild.channels || []).filter(
            (c: any) => c.type === 2 || c.type === 13 || c.purpose === 'voice_streaming'
          );

          for (const ch of voiceChannels) {
            for (const bot of readyBots) {
              destinations.push({
                id: `${bot.id}_${ch.id}`,
                botId: bot.id,
                botName: bot.displayName,
                guildId: guild.guildId,
                guildName: guild.displayName,
                channelId: ch.channelId,
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

  // START VOICE SESSION
  const handleStartSession = async () => {
    if (!currentWorkspace || selectedDestinationIds.length === 0) return;
    setErrorMsg(null);
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

      // Connect nodes
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

      // 3. Create Voice Session on Backend API
      const selectedDests = availableDestinations.filter((d) =>
        selectedDestinationIds.includes(d.id)
      );

      // Fetch corresponding channelConfig IDs
      const sessionPayload = {
        workspaceId: currentWorkspace.id,
        destinations: selectedDests.map((d) => ({
          botId: d.botId,
          guildConnectionId: d.guildId, // Handled by server lookup
          channelConfigId: d.channelId, // Handled by server lookup
        })),
        audioConfiguration: {
          sampleRate: 48000,
          channels: 1,
          noiseSuppression,
          highPassFilter,
          compressor: compressorEnabled,
          inputGain,
        },
      };

      // Call API to create session & retrieve Media Session Token
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

      // Set output cards
      setOutputCards(
        selectedDests.map((d, idx) => ({
          endpointId: endpoints[idx]?.endpointId || `ep_${idx}`,
          botId: d.botId,
          botName: d.botName,
          channelName: d.channelName,
          guildName: d.guildName,
          state: 'connected',
          gain: 1.0,
          muted: false,
          vuLevel: 0,
        }))
      );

      // 4. Connect to Media Gateway WebSocket
      const wsUrl = `ws://${window.location.hostname}:3001?token=${mediaToken}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      // 5. ScriptProcessorNode for streaming PCM Audio Chunks
      const bufferSize = 2048;
      const scriptProcessor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      compressor.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      scriptProcessor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMicMuted) {
          const inputChannel = e.inputBuffer.getChannelData(0);
          // Convert Float32 to 16-bit PCM buffer
          const pcm16 = new Int16Array(inputChannel.length);
          for (let i = 0; i < inputChannel.length; i++) {
            const s = Math.max(-1, Math.min(1, inputChannel[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(pcm16.buffer);
        }
      };

      // Handle WebSocket messages (telemetry & VU meter sync)
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
        // Trigger server-side voice worker connection
        await fetch(`/api/voice-sessions/${sessionId}/start`, { method: 'POST' });
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
    if (sessionState === 'streaming') return; // Locked during streaming
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
            Capture browser microphone audio, apply studio filters, and broadcast to multiple Discord voice channels.
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
              <span>Stop Session</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={selectedDestinationIds.length === 0}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Transmission</span>
            </button>
          )}

          <button
            onClick={triggerEmergencyStop}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-white font-bold text-xs uppercase shadow-lg shadow-destructive/20 transition active:scale-95"
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

      {/* STUDIO LAYOUT GRID: INPUT MIXER & SESSION CONTROLLER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. INPUT MIXER SECTION (PRD Section 8.2) */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <span>Microphone & Ingest Processing</span>
            </h2>
            <button
              onClick={() => setIsMicMuted(!isMicMuted)}
              className={`p-1.5 rounded-lg border text-xs font-medium transition ${
                isMicMuted
                  ? 'bg-destructive/20 text-destructive border-destructive/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
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
              <span className="font-medium text-muted-foreground">Input Level</span>
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
              <span className="font-medium text-muted-foreground">Input Gain</span>
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

        {/* 2. MASTER CONTROLS & DESTINATIONS SELECTOR */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Destination Voice Routing</span>
              </h2>
              <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                <span>Duration: <strong className="text-foreground font-mono">{sessionDurationSec}s</strong></span>
                <span>Latency: <strong className="text-emerald-400 font-mono">~{latencyMs}ms</strong></span>
              </div>
            </div>

            {/* Destination Selection Checklist */}
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
                <span>Select Target Bots &amp; Voice Channels ({selectedDestinationIds.length} selected):</span>
                <button
                  onClick={loadDestinations}
                  className="text-primary hover:underline text-[11px] flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh list</span>
                </button>
              </div>

              {availableDestinations.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/30 rounded-lg">
                  No voice channels found. Please ensure at least one bot is registered and installed in a Discord guild with voice channels.
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
          </div>

          {/* Master Controls Section (PRD Section 8.2 Master section) */}
          <div className="p-4 rounded-xl bg-secondary/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4 flex-1">
              <button
                onClick={() => setMasterMuted(!masterMuted)}
                className={`p-2 rounded-lg border transition ${
                  masterMuted
                    ? 'bg-destructive/20 text-destructive border-destructive/30'
                    : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                }`}
              >
                {masterMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <div className="flex-1 max-w-xs">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">Master Studio Gain</span>
                  <span className="font-mono text-muted-foreground">{Math.round(masterGain * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={masterGain}
                  onChange={(e) => setMasterGain(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground text-right">
              <div>Output Format: <strong className="text-foreground">PCM 48kHz Mono</strong></div>
              <div>Buffer Limit: <strong className="text-foreground">2048 frames (42ms)</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INDEPENDENT OUTPUT CARDS (PRD Section 8.2 & 8.8) */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span>Active Discord Voice Output Channels ({outputCards.length})</span>
        </h2>

        {outputCards.length === 0 ? (
          <div className="p-12 text-center bg-card border border-border rounded-xl text-xs text-muted-foreground">
            No active voice channels transmitting. Select destinations and click &quot;Start Transmission&quot; above.
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
                        <Hash className="w-4 h-4 text-primary" />
                        <span>{card.channelName}</span>
                      </h3>
                      <div className="text-[11px] text-muted-foreground">
                        Bot: <strong>{card.botName}</strong> • {card.guildName}
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

                  {/* Per-Output Gain */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground">
                      <span>Per-Output Gain</span>
                      <span className="font-mono">{Math.round(card.gain * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
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

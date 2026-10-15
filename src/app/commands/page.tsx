'use client';

import React, { useState } from 'react';
import {
  Terminal,
  Play,
  CheckCircle2,
  AlertTriangle,
  Code2,
  Sliders,
  Bot,
  Hash,
  RefreshCw,
  Sparkles,
  Volume2,
  Users,
  Radio,
  Zap,
  Mail,
  Send,
  Shield,
  X,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function CommandCenterPage() {
  const { currentWorkspace, triggerEmergencyStop } = useWorkspace();

  const [selectedCommand, setSelectedCommand] = useState('!dm @user {message} .5');
  const [simulatorOutput, setSimulatorOutput] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPurgingCommands, setIsPurgingCommands] = useState(false);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const prefixCommands = [
    {
      name: '!dm @user {message} .count',
      description: 'ALL connected bots send direct messages to the target user simultaneously according to count.',
      category: 'Fleet Messaging',
      examples: [
        '!dm @user hello there .5',
        '!dm @user {important announcement} .3',
        '!dm 1316627667180851211 wake up!',
        '!dm @user test message',
      ],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!dm stop',
      description: 'Immediately cancel and halt all ongoing DM operations across all bots.',
      category: 'Fleet Messaging',
      examples: ['!dm stop'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!spam {message} .count',
      description: 'ALL connected bots simultaneously post the message in the channel where the command was typed.',
      category: 'Channel Messaging',
      examples: [
        '!spam {fleet alert} .10',
        '!spam wake up! .5',
        '!spam announcement',
      ],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!spam stop',
      description: 'Immediately stop all active channel spam operations across all bots.',
      category: 'Channel Messaging',
      examples: ['!spam stop'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!status',
      description: 'Display real-time gateway health, latency, and voice state across ALL fleet bots.',
      category: 'Fleet Health',
      examples: ['!status', '@Bot status'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!ping',
      description: 'Check WebSocket latency and API response time in milliseconds.',
      category: 'Diagnostics',
      examples: ['!ping'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!join [channel]',
      description: 'Connect ALL fleet bots to the target voice channel simultaneously.',
      category: 'Voice Controls',
      examples: ['!join', '!fleet join', '!join 1316627667180851211'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!leave',
      description: 'Disconnect ALL fleet bots from the active voice channel simultaneously.',
      category: 'Voice Controls',
      examples: ['!leave', '!fleet leave'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!fleet join [channel]',
      description: 'Connect all bots in the server to the voice channel simultaneously.',
      category: 'Voice Controls',
      examples: ['!fleet join', '!fleet join 1316627667180851211'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!fleet leave',
      description: 'Disconnect all bots from active voice channels simultaneously.',
      category: 'Voice Controls',
      examples: ['!fleet leave'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!fleet stop / !stop',
      description: 'Emergency halt: Immediately terminate all audio streams and disconnect all bots.',
      category: 'Voice Controls',
      examples: ['!stop', '!fleet stop'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!volume <1-10000>',
      description: 'Set master audio playback volume across all bots (1% to 10000%).',
      category: 'Audio Controls',
      examples: ['!volume 100', '!volume 500', '!fleet volume 1000'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!mute / !fleet mute',
      description: 'Mute voice audio output across all active bots.',
      category: 'Audio Controls',
      examples: ['!mute', '!fleet mute'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!unmute / !fleet unmute',
      description: 'Unmute voice audio output across all active bots.',
      category: 'Audio Controls',
      examples: ['!unmute', '!fleet unmute'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!play <song or link> / !p <song or link>',
      description: 'Play high-fidelity music across ALL fleet bots simultaneously using search query or direct link.',
      category: 'Fleet Music',
      examples: ['!play despacito', '!p alan walker faded', '!play https://www.youtube.com/watch?v=60ItHLz5WEA'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!pause',
      description: 'Pause synchronized music playback across all fleet bots.',
      category: 'Fleet Music',
      examples: ['!pause'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!resume',
      description: 'Resume synchronized music playback across all fleet bots.',
      category: 'Fleet Music',
      examples: ['!resume'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!nowplaying / !np',
      description: 'Display currently playing track, progress, volume, and requester.',
      category: 'Fleet Music',
      examples: ['!nowplaying', '!np'],
      access: 'Workspace Owner & Added Admins',
    },
    {
      name: '!help',
      description: 'Display all available fleet prefix commands.',
      category: 'Help',
      examples: ['!help'],
      access: 'Workspace Owner & Added Admins',
    },
  ];

  const handlePurgeSlashCommands = async () => {
    setIsPurgingCommands(true);
    setPurgeStatus(null);
    setPurgeError(null);

    try {
      const res = await fetch('/api/fleet/sync-commands', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to sync commands');
      }

      setPurgeStatus(
        `Successfully purged slash commands from Discord API across ${data.data.summary.successfulBots} bots. All bots operate exclusively via !prefix commands.`
      );
    } catch (err: any) {
      setPurgeError(err.message);
    } finally {
      setIsPurgingCommands(false);
    }
  };

  const handleRunSimulator = async () => {
    setIsSimulating(true);
    setSimulatorOutput(null);

    setTimeout(async () => {
      if (selectedCommand === '!dm stop') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: '!dm stop',
              action: 'dmAbortController.abort() signaled',
              botResponse: '🛑 Stopped all ongoing DM operations across all bots.',
              stealthExecution: 'Clean execution without mentioning admin command status',
            },
            null,
            2
          )
        );
      } else if (selectedCommand.startsWith('!dm')) {
        const isDeveloperTargeted = selectedCommand.includes('788970167907778562');
        if (isDeveloperTargeted) {
          setSimulatorOutput(
            JSON.stringify(
              {
                sender: 'WorkspaceAdmin (Authorized)',
                command: selectedCommand,
                developerShield: 'Developer protection triggered',
                protectedTarget: 'Developer ID 788970167907778562',
                reflectedTarget: '<@CallerUserId>',
                botResponse: "❌ You can't make DM to the developer. Messages reflected back to sender!\n💥 25 bots dispatched 5 direct message(s) each to <@CallerUserId>.",
                stealthExecution: 'Clean execution without mentioning admin command status',
              },
              null,
              2
            )
          );
        } else {
          setSimulatorOutput(
            JSON.stringify(
              {
                sender: 'WorkspaceOwner (Authorized)',
                command: selectedCommand,
                action: 'Dispatched direct messages to target user simultaneously across all bots',
                botResponse: '📨 25 bots sent 5 direct message(s) each (125 total) to <@TargetUser> simultaneously.',
                stealthExecution: 'Clean execution without mentioning admin command status',
              },
              null,
              2
            )
          );
        }
      } else if (selectedCommand === '!spam stop') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: '!spam stop',
              action: 'spamAbortController.abort() signaled',
              botResponse: '🛑 Stopped all channel spam operations across all bots.',
            },
            null,
            2
          )
        );
      } else if (selectedCommand.startsWith('!spam')) {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: selectedCommand,
              action: 'All connected bots sending messages to channel simultaneously',
              botResponse: '🔥 25 bots completed spamming 5 message(s) each in this channel.',
            },
            null,
            2
          )
        );
      } else if (selectedCommand.startsWith('!play') || selectedCommand.startsWith('!p ') || selectedCommand === '!p') {
        const query = selectedCommand.replace(/^!(play|p)\s*/i, '').trim();
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: selectedCommand,
              action: 'Fleet music engine resolved track & connected all bots to voice channel simultaneously',
              resolvedTrack: {
                title: query || 'Alan Walker - Faded',
                duration: '3:33',
                source: query.startsWith('http') ? 'Direct Link' : 'YouTube High-Fidelity Audio',
                streamRate: '48kHz Stereo PCM (SoX 28-bit • 384 kbps Opus FEC)',
              },
              synchronizedBots: 25,
              botResponse: `🎶 Playing **${query || 'Alan Walker - Faded'}** (\`3:33\`) at **Studio Master Quality** (48kHz SoX 28-bit • 384 kbps Opus) across **25 fleet bots** simultaneously in **General** at 100% volume.`,
              stealthExecution: 'Clean execution without mentioning admin command status',
            },
            null,
            2
          )
        );
      } else if (selectedCommand === '!pause') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: '!pause',
              action: 'Paused shared audio player across all fleet bots',
              botResponse: '⏸️ Paused playback across all fleet bots.',
            },
            null,
            2
          )
        );
      } else if (selectedCommand === '!resume') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: '!resume',
              action: 'Resumed shared audio player across all fleet bots',
              botResponse: '▶️ Resumed playback across all fleet bots.',
            },
            null,
            2
          )
        );
      } else if (selectedCommand === '!nowplaying' || selectedCommand === '!np') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner (Authorized)',
              command: selectedCommand,
              botResponse: "🎵 **Now Playing across all fleet bots**:\n**Alan Walker - Faded**\n⏱️ Progress: `01:45 / 03:33` | Status: `PLAYING`\n🔊 Volume: `100%`\n🔗 Link: <https://www.youtube.com/watch?v=60ItHLz5WEA>\n👤 Requested by: <@WorkspaceOwner>",
            },
            null,
            2
          )
        );
      } else if (selectedCommand.includes('stop')) {
        await triggerEmergencyStop();
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner',
              command: selectedCommand,
              action: 'Voice playback halted & connections terminated',
              botResponse: '🛑 Stopped all audio playback and disconnected all bots.',
            },
            null,
            2
          )
        );
      } else if (selectedCommand === '!status') {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner',
              command: '!status',
              botResponse: '🤖 Fleet Status: 25 / 25 bots online | 0 in voice | Latency: 22ms',
            },
            null,
            2
          )
        );
      } else if (selectedCommand.includes('volume')) {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner',
              command: selectedCommand,
              botResponse: '🔊 Master volume set across all bots simultaneously.',
            },
            null,
            2
          )
        );
      } else {
        setSimulatorOutput(
          JSON.stringify(
            {
              sender: 'WorkspaceOwner',
              command: selectedCommand,
              status: 'Executed successfully across all bots without revealing admin command',
            },
            null,
            2
          )
        );
      }
      setIsSimulating(false);
    }, 250);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <span>Command Center (!prefix)</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fleet commands execute simultaneously across all active bots. Access is restricted to Workspace Owner &amp; Added Admins.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePurgeSlashCommands}
            disabled={isPurgingCommands}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-medium transition disabled:opacity-50"
            title="Clean Discord application command cache to remove old slash commands"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isPurgingCommands ? 'animate-spin' : ''}`} />
            <span>{isPurgingCommands ? 'Purging Slash Commands...' : 'Purge Slash Commands'}</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK STATUS ALERT */}
      {purgeStatus && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{purgeStatus}</span>
          </div>
          <button onClick={() => setPurgeStatus(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {purgeError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{purgeError}</span>
          </div>
          <button onClick={() => setPurgeError(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PERMISSIONS POLICY ADVISORY */}
      <div className="p-3 rounded-lg bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-foreground">Access Control &amp; Stealth Mode:</span>
            <p className="text-muted-foreground mt-0.5">
              Commands respond strictly to the <strong>Workspace Owner</strong> and <strong>Added Workspace Admins</strong>.
              Bot responses never state that an admin command was invoked.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
            Prefix Only
          </span>
          <span className="px-2 py-0.5 rounded bg-secondary border border-border text-muted-foreground text-[10px] font-mono">
            Owner &amp; Admin
          </span>
        </div>
      </div>

      {/* TWO COLUMN GRID: COMMAND LIST & SIMULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: COMMAND LIST (7 COLS) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h3 className="text-xs font-semibold text-foreground">Fleet Commands Reference</h3>
                <p className="text-[11px] text-muted-foreground">Click any command to load it into the tester</p>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {prefixCommands.length} commands
              </span>
            </div>

            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {prefixCommands.map((cmd) => {
                const isSelected = selectedCommand === (cmd.examples[0] || cmd.name);
                return (
                  <div
                    key={cmd.name}
                    onClick={() => setSelectedCommand(cmd.examples[0] || cmd.name)}
                    className={`p-2.5 rounded-md border transition cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-[#5865F2]/10 border-[#5865F2]'
                        : 'bg-secondary/40 hover:bg-secondary/70 border-border/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono font-bold text-primary">
                          {cmd.name}
                        </code>
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">
                          {cmd.category}
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border">
                        {cmd.access}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{cmd.description}</p>

                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/40 text-[10px]">
                      <span className="text-muted-foreground">Example:</span>
                      {cmd.examples.map((ex) => (
                        <span
                          key={ex}
                          className="font-mono px-1.5 py-0.2 rounded bg-card border border-border text-foreground hover:text-primary transition"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: INTERACTIVE TESTER (5 COLS) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">Command Tester</h3>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">Simulate Command</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">
                  Command Input
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedCommand}
                    onChange={(e) => setSelectedCommand(e.target.value)}
                    placeholder="!dm @user {message} .count"
                    className="w-full px-2.5 py-1.5 font-mono text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={handleRunSimulator}
                    disabled={isSimulating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shrink-0 transition disabled:opacity-50 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Run</span>
                  </button>
                </div>
              </div>

              {/* SIMULATOR RESPONSE */}
              <div>
                <label className="font-semibold text-muted-foreground block mb-1">
                  Fleet Response Output
                </label>
                <pre className="p-3 rounded-md bg-[#0e1015] border border-border font-mono text-[11px] text-emerald-400 overflow-x-auto min-h-[180px] max-h-[300px] leading-relaxed">
                  {isSimulating
                    ? 'Dispatching command over fleet gateway...'
                    : simulatorOutput ||
                      '// Select a command from the left or type your own, then click Run.\n// Example:\n// !dm @user hello there .5\n// !spam wake up! .10\n// !fleet join'}
                </pre>
              </div>

              {/* SYNTAX TIPS */}
              <div className="p-2.5 rounded-md bg-secondary/30 border border-border text-[11px] text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground">Command Syntax:</div>
                <div>• <code className="text-primary font-mono">!play {"<song or link>"}</code> or <code className="text-primary font-mono">!p</code> — ALL bots play music simultaneously</div>
                <div>• <code className="text-primary font-mono">!pause</code> / <code className="text-primary font-mono">!resume</code> — Pause or resume music across all fleet bots</div>
                <div>• <code className="text-primary font-mono">!nowplaying</code> or <code className="text-primary font-mono">!np</code> — Show current track, duration &amp; requester</div>
                <div>• <code className="text-primary font-mono">!dm @user {"{message}"} .count</code> — All bots DM user simultaneously</div>
                <div>• <code className="text-primary font-mono">!dm stop</code> — Halts ongoing DM operations across all bots</div>
                <div>• <code className="text-primary font-mono">!spam {"{message}"} .count</code> — All bots spam current channel simultaneously</div>
                <div>• <code className="text-primary font-mono">!spam stop</code> — Halts active channel spam across all bots</div>
                <div>• Developer ID (<code className="font-mono">788970167907778562</code>) is protected by the Reflection Shield.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

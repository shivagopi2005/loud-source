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
  Shield,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function CommandCenterPage() {
  const { currentWorkspace, triggerEmergencyStop } = useWorkspace();

  const [selectedCommand, setSelectedCommand] = useState('/status');
  const [simulatorOutput, setSimulatorOutput] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [prefixEnabled, setPrefixEnabled] = useState(false);

  const slashCommands = [
    {
      name: '/status',
      description: 'Display real-time health, connection, and voice state of the active bot.',
      category: 'Diagnostics',
    },
    {
      name: '/voice connect',
      description: 'Connect bot to an approved voice destination channel.',
      category: 'Voice Controls',
    },
    {
      name: '/voice disconnect',
      description: 'Disconnect bot from active voice channel.',
      category: 'Voice Controls',
    },
    {
      name: '/voice mute',
      description: 'Mute bot output in the voice channel.',
      category: 'Voice Controls',
    },
    {
      name: '/voice unmute',
      description: 'Unmute bot output in the voice channel.',
      category: 'Voice Controls',
    },
    {
      name: '/fleet status',
      description: 'Return full fleet-wide availability across all registered applications.',
      category: 'Fleet Operations',
    },
    {
      name: '/fleet stop',
      description: 'Execute emergency shutdown across all active fleet voice sessions.',
      category: 'Fleet Operations',
    },
    {
      name: '/test message',
      description: 'Trigger an authorized single test message to the configured test channel.',
      category: 'Messaging',
    },
    {
      name: '/help',
      description: 'List available commands and permissions in this guild.',
      category: 'General',
    },
  ];

  const handleRunSimulator = async () => {
    setIsSimulating(true);
    setSimulatorOutput(null);

    setTimeout(async () => {
      if (selectedCommand === '/fleet stop') {
        await triggerEmergencyStop();
        setSimulatorOutput(
          JSON.stringify(
            {
              type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
              data: {
                content: '🛑 **EMERGENCY STOP TRIGGERED**: All active voice sessions and bot connections terminated immediately.',
                flags: 64, // Ephemeral
              },
            },
            null,
            2
          )
        );
      } else if (selectedCommand === '/status') {
        setSimulatorOutput(
          JSON.stringify(
            {
              type: 4,
              data: {
                embeds: [
                  {
                    title: 'Studio Voice Bot • Operational Status',
                    color: 0x5865f2,
                    fields: [
                      { name: 'Gateway', value: 'Connected (Ping: 22ms)', inline: true },
                      { name: 'Voice Stream', value: 'Active / Healthy', inline: true },
                      { name: 'Workspace', value: currentWorkspace?.name || 'Studio Prime', inline: true },
                    ],
                    footer: { text: 'Loud Voice Studio Control Plane' },
                  },
                ],
              },
            },
            null,
            2
          )
        );
      } else {
        setSimulatorOutput(
          JSON.stringify(
            {
              type: 4,
              data: {
                content: `Command \`${selectedCommand}\` processed successfully by control plane service.`,
              },
            },
            null,
            2
          )
        );
      }
      setIsSimulating(false);
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Terminal className="w-6 h-6 text-primary" />
          <span>Command Center &amp; Discord Slash Commands</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Registered Discord Application Slash Commands and strict prefix parsers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLASH COMMANDS LIST */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground">Registered Application Commands</h2>
          <p className="text-xs text-muted-foreground">
            Strict Discord interactions verified through OAuth2 cryptographic signatures.
          </p>

          <div className="divide-y divide-border/40">
            {slashCommands.map((cmd) => (
              <div
                key={cmd.name}
                onClick={() => setSelectedCommand(cmd.name)}
                className={`py-3 px-3 rounded-lg flex items-center justify-between cursor-pointer transition ${
                  selectedCommand === cmd.name ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary/40'
                }`}
              >
                <div>
                  <div className="text-xs font-mono font-bold text-primary">{cmd.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{cmd.description}</div>
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                  {cmd.category}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* INTERACTIVE SIMULATOR */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-emerald-400" />
              <span>Slash Command Simulator</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Test interaction handling and response payload generation without switching windows.
            </p>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Selected Command</label>
              <div className="p-2.5 rounded-lg bg-secondary font-mono text-xs text-foreground font-semibold">
                {selectedCommand}
              </div>
            </div>

            <button
              onClick={handleRunSimulator}
              disabled={isSimulating}
              className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isSimulating ? 'Executing Interaction...' : 'Run Simulation'}</span>
            </button>

            {simulatorOutput && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Discord Interaction Response:</span>
                <pre className="p-3 rounded-lg bg-[#1e1f22] text-[#3ba55d] text-[11px] font-mono overflow-x-auto max-h-56">
                  {simulatorOutput}
                </pre>
              </div>
            )}
          </div>

          {/* Optional Prefix Commands */}
          <div className="pt-4 border-t border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Legacy Text-Prefix Commands</span>
              <input
                type="checkbox"
                checked={prefixEnabled}
                onChange={(e) => setPrefixEnabled(e.target.checked)}
                className="rounded accent-primary w-4 h-4 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Disabled by default. When enabled, allows strict parsing of `!status`, `!test`, and `!voice stop`.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

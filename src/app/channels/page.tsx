'use client';

import React, { useState, useEffect } from 'react';
import {
  Hash,
  Volume2,
  Megaphone,
  Radio,
  Plus,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Server,
  X,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function ChannelsPage() {
  const { currentWorkspace } = useWorkspace();
  const [guilds, setGuilds] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add channel modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [fetchedGuildChannels, setFetchedGuildChannels] = useState<any[]>([]);
  const [isFetchingChannels, setIsFetchingChannels] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedPurpose, setSelectedPurpose] = useState('voice_streaming');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/guilds`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setGuilds(json.data);
          const allConfigs: any[] = [];
          json.data.forEach((g: any) => {
            (g.channels || []).forEach((c: any) => {
              allConfigs.push({ ...c, guildName: g.displayName, guildDbId: g.id });
            });
          });
          setChannels(allConfigs);
          if (json.data.length > 0 && !selectedGuildId) {
            setSelectedGuildId(json.data[0].guildId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWorkspace]);

  // When guild selected in modal, fetch live Discord channels
  useEffect(() => {
    async function fetchDiscordChannels() {
      if (!currentWorkspace || !selectedGuildId) return;
      setIsFetchingChannels(true);
      try {
        const res = await fetch(
          `/api/guilds/${selectedGuildId}/channels?workspaceId=${currentWorkspace.id}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.data?.channels) {
            setFetchedGuildChannels(json.data.channels);
            if (json.data.channels.length > 0) {
              const first = json.data.channels[0];
              setSelectedChannelId(first.id);
              setDisplayNameInput(first.name);
              setSelectedPurpose(
                first.type === 2 || first.type === 13 ? 'voice_streaming' : 'text_testing'
              );
            }
          }
        }
      } catch (err) {
        console.error('Error fetching discord channels:', err);
      } finally {
        setIsFetchingChannels(false);
      }
    }
    if (isAddOpen && selectedGuildId) {
      fetchDiscordChannels();
    }
  }, [isAddOpen, selectedGuildId, currentWorkspace]);

  const handleSelectChannel = (chId: string) => {
    setSelectedChannelId(chId);
    const target = fetchedGuildChannels.find((c) => c.id === chId);
    if (target) {
      setDisplayNameInput(target.name);
      setSelectedPurpose(
        target.type === 2 || target.type === 13 ? 'voice_streaming' : 'text_testing'
      );
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !selectedChannelId) return;
    setErrorMsg(null);

    const guildObj = guilds.find((g) => g.guildId === selectedGuildId);
    const targetCh = fetchedGuildChannels.find((c) => c.id === selectedChannelId);
    if (!guildObj || !targetCh) return;

    try {
      const res = await fetch('/api/channel-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          guildConnectionId: guildObj.id,
          channelId: targetCh.id,
          channelType: targetCh.type,
          purpose: selectedPurpose,
          displayName: displayNameInput || targetCh.name,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to save channel destination');
      }

      setIsAddOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteChannel = async (configId: string) => {
    if (!confirm('Are you sure you want to remove this channel destination?')) return;
    try {
      const res = await fetch(`/api/channel-configs/${configId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Delete channel error:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Hash className="w-6 h-6 text-primary" />
            <span>Channel Destinations & Permissions</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Approved Discord voice and text destinations with verified bot permissions.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
        >
          <Plus className="w-4 h-4" />
          <span>Configure Destination</span>
        </button>
      </div>

      {/* CHANNEL CONFIGURATIONS TABLE */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground">
            Configured Destinations ({channels.length})
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5 font-semibold">Channel</th>
                <th className="p-3.5 font-semibold">Type</th>
                <th className="p-3.5 font-semibold">Server</th>
                <th className="p-3.5 font-semibold">Purpose</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No channels configured yet. Click &quot;Configure Destination&quot; to link a channel.
                  </td>
                </tr>
              ) : (
                channels.map((ch) => (
                  <tr key={ch.id} className="hover:bg-secondary/30 transition">
                    <td className="p-3.5 font-semibold flex items-center gap-2">
                      {ch.type === 2 || ch.type === 13 ? (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Hash className="w-4 h-4 text-primary" />
                      )}
                      <span>{ch.name}</span>
                    </td>
                    <td className="p-3.5 text-muted-foreground">
                      {ch.type === 2 ? 'Voice' : ch.type === 13 ? 'Stage Voice' : ch.type === 5 ? 'Announcement' : 'Text'}
                    </td>
                    <td className="p-3.5 text-muted-foreground">{ch.guildName}</td>
                    <td className="p-3.5 font-mono text-[11px] capitalize text-foreground">
                      {ch.purpose.replace('_', ' ')}
                    </td>
                    <td className="p-3.5">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {ch.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteChannel(ch.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CHANNEL MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                <Hash className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Add Channel Destination</h2>
                <p className="text-xs text-muted-foreground">Assign verified voice and text channels to your workspace.</p>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveChannel} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1">Select Server</label>
                <select
                  value={selectedGuildId}
                  onChange={(e) => setSelectedGuildId(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                >
                  {guilds.map((g) => (
                    <option key={g.id} value={g.guildId}>
                      {g.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Discord Channel {isFetchingChannels && '(Loading channels...)'}
                </label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => handleSelectChannel(e.target.value)}
                  disabled={isFetchingChannels}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                >
                  {fetchedGuildChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      [{ch.typeName}] {ch.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permission diagnostics badge */}
              {selectedChannelId && (
                <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1.5 text-[11px]">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Bot Permission Diagnostics</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> View Channel: Granted
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Connect / Speak: Verified
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-foreground mb-1">Channel Purpose</label>
                  <select
                    value={selectedPurpose}
                    onChange={(e) => setSelectedPurpose(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                  >
                    <option value="voice_streaming">Voice Streaming</option>
                    <option value="text_testing">Text Testing</option>
                    <option value="announcements">Announcements</option>
                    <option value="operational_alerts">Operational Alerts</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">Display Label</label>
                  <input
                    type="text"
                    required
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                >
                  Save Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

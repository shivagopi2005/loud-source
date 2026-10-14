'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Megaphone,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Ban,
  Bot,
  Hash,
  Eye,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function MessagingCenterPage() {
  const { currentWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'test' | 'announcements' | 'history'>('test');

  const [bots, setBots] = useState<any[]>([]);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [messageJobs, setMessageJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Test Message State
  const [selectedBotId, setSelectedBotId] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [testContent, setTestContent] = useState('Studio fleet operational test message. Status: 100% operational.');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Announcement State
  const [annTitle, setAnnTitle] = useState('Fleet Maintenance Advisory');
  const [annContent, setAnnContent] = useState('Scheduled audio optimization in progress across all voice channels.');
  const [selectedChannelsForAnn, setSelectedChannelsForAnn] = useState<string[]>([]);
  const [isSubmittingAnn, setIsSubmittingAnn] = useState(false);
  const [annSuccess, setAnnSuccess] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const [botsRes, guildsRes, jobsRes] = await Promise.all([
        fetch(`/api/workspaces/${currentWorkspace.id}/bots`),
        fetch(`/api/workspaces/${currentWorkspace.id}/guilds`),
        fetch(`/api/message-jobs?workspaceId=${currentWorkspace.id}`),
      ]);

      if (botsRes.ok && guildsRes.ok && jobsRes.ok) {
        const b = await botsRes.json();
        const g = await guildsRes.json();
        const j = await jobsRes.json();

        if (b.data) {
          setBots(b.data);
          if (b.data.length > 0 && !selectedBotId) setSelectedBotId(b.data[0].id);
        }
        if (g.data) {
          setGuilds(g.data);
          // Find first text channel
          for (const guild of g.data) {
            const textCh = (guild.channels || []).find((c: any) => c.type === 0 || c.type === 5);
            if (textCh && !selectedChannelId) {
              setSelectedChannelId(textCh.channelId);
              break;
            }
          }
        }
        if (j.data) setMessageJobs(j.data);
      }
    } catch (err) {
      console.error('Failed to load messaging data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWorkspace]);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !selectedBotId || !selectedChannelId) return;
    setTestError(null);
    setTestResult(null);
    setIsSendingTest(true);

    try {
      const res = await fetch('/api/messages/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          botId: selectedBotId,
          channelId: selectedChannelId,
          content: testContent,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to send test message');
      }

      setTestResult(json.data);
      await loadData();
    } catch (err: any) {
      setTestError(err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !selectedBotId || selectedChannelsForAnn.length === 0) return;
    setIsSubmittingAnn(true);
    setAnnSuccess(null);

    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          botId: selectedBotId,
          title: annTitle,
          content: annContent,
          destinationChannelIds: selectedChannelsForAnn,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Announcement submission failed');
      }

      setAnnSuccess(`Announcement queued to ${json.data.totalQueued} destinations!`);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingAnn(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/message-jobs/${jobId}/cancel`, { method: 'POST' });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Cancel job error:', err);
    }
  };

  const allConfiguredTextChannels = guilds.flatMap((g) =>
    (g.channels || [])
      .filter((c: any) => c.type === 0 || c.type === 5 || c.purpose === 'text_testing' || c.purpose === 'announcements')
      .map((c: any) => ({ ...c, guildName: g.displayName }))
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            <span>Messaging Center</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Controlled test messaging, fleet announcements, and auditable delivery queue.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center space-x-1 bg-secondary/60 p-1 rounded-xl border border-border">
          <button
            onClick={() => setActiveTab('test')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'test' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Test Console
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'announcements' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Announcements
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'history' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Job History
          </button>
        </div>
      </div>

      {/* 1. TEST MESSAGING CONSOLE (PRD Section 9.1) */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground">Send Test Message</h2>
            <p className="text-xs text-muted-foreground">
              Sends a single confirmed verification message to an authorized text channel.
            </p>

            {testError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{testError}</span>
              </div>
            )}

            {testResult && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Message confirmed delivered! Discord ID: {testResult.messageId}</span>
              </div>
            )}

            <form onSubmit={handleSendTest} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1">Sending Bot</label>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName} ({b.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">Target Text Channel</label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                >
                  {allConfiguredTextChannels.map((c) => (
                    <option key={c.id} value={c.channelId}>
                      #{c.name} ({c.guildName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">Message Content</label>
                <textarea
                  rows={4}
                  required
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg p-3 text-foreground font-mono outline-none focus:border-primary resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSendingTest || !selectedChannelId}
                className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSendingTest ? 'Sending to Discord...' : 'Send Test Message'}</span>
              </button>
            </form>
          </div>

          {/* Live Preview */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5 mb-2">
                <Eye className="w-4 h-4 text-primary" />
                <span>Discord Client Preview</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Real-time simulation of Discord chat rendering.</p>

              <div className="bg-[#313338] rounded-xl p-4 border border-[#2b2d31] space-y-3 font-sans">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold text-xs shrink-0">
                    BOT
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white text-sm">
                        {bots.find((b) => b.id === selectedBotId)?.displayName || 'Discord Bot'}
                      </span>
                      <span className="bg-[#5865F2] text-white text-[10px] font-bold px-1 rounded">
                        APP
                      </span>
                      <span className="text-[10px] text-[#949ba4]">Today at {new Date().toLocaleTimeString()}</span>
                    </div>
                    <div className="text-sm text-[#dbdee1] whitespace-pre-wrap">{testContent}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
              Every message send creates an immutable record in the audit log and BullMQ message job queue.
            </div>
          </div>
        </div>
      )}

      {/* 2. FLEET ANNOUNCEMENTS (PRD Section 9.2) */}
      {activeTab === 'announcements' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5 max-w-2xl">
          <div>
            <h2 className="text-sm font-bold text-foreground">Compose Fleet Announcement</h2>
            <p className="text-xs text-muted-foreground">
              Broadcast official announcements with rich embeds across multiple authorized servers simultaneously.
            </p>
          </div>

          {annSuccess && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">
              {annSuccess}
            </div>
          )}

          <form onSubmit={handleSendAnnouncement} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-foreground mb-1">Announcement Title</label>
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">Announcement Content</label>
              <textarea
                rows={4}
                required
                value={annContent}
                onChange={(e) => setAnnContent(e.target.value)}
                className="w-full bg-secondary/60 border border-border rounded-lg p-3 text-foreground outline-none focus:border-primary resize-none"
              />
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">
                Select Destination Channels ({selectedChannelsForAnn.length} selected)
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-secondary/30 rounded-lg border border-border">
                {allConfiguredTextChannels.map((ch) => {
                  const isChecked = selectedChannelsForAnn.includes(ch.channelId);
                  return (
                    <label key={ch.id} className="flex items-center space-x-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedChannelsForAnn((prev) =>
                            isChecked ? prev.filter((id) => id !== ch.channelId) : [...prev, ch.channelId]
                          );
                        }}
                        className="rounded accent-primary w-4 h-4"
                      />
                      <span>#{ch.name} ({ch.guildName})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingAnn || selectedChannelsForAnn.length === 0}
              className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-50"
            >
              {isSubmittingAnn ? 'Queuing Announcements...' : 'Dispatch Announcement'}
            </button>
          </form>
        </div>
      )}

      {/* 3. MESSAGE JOB HISTORY (PRD Section 9.4) */}
      {activeTab === 'history' && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-bold text-foreground">Message Jobs Queue ({messageJobs.length})</h2>
            <button
              onClick={loadData}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3.5 font-semibold">Job ID</th>
                  <th className="p-3.5 font-semibold">Type</th>
                  <th className="p-3.5 font-semibold">Channel</th>
                  <th className="p-3.5 font-semibold">State</th>
                  <th className="p-3.5 font-semibold">Created</th>
                  <th className="p-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {messageJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No message jobs recorded.
                    </td>
                  </tr>
                ) : (
                  messageJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-secondary/30 transition">
                      <td className="p-3.5 font-mono text-[11px] text-foreground">{job.id.slice(0, 8)}...</td>
                      <td className="p-3.5 capitalize text-foreground">{job.jobType.replace('_', ' ')}</td>
                      <td className="p-3.5 font-mono text-muted-foreground">{job.destinationId}</td>
                      <td className="p-3.5">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                            job.state === 'sent'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : job.state === 'failed'
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : job.state === 'cancelled'
                              ? 'bg-secondary text-muted-foreground border-border'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {job.state}
                        </span>
                      </td>
                      <td className="p-3.5 text-muted-foreground">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="p-3.5 text-right">
                        {job.state === 'queued' && (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

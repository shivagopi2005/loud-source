'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Users,
  UserPlus,
  Shield,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function WorkspaceSettingsPage() {
  const { currentWorkspace, refreshWorkspaces } = useWorkspace();

  const [workspaceName, setWorkspaceName] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviteRole, setInviteRole] = useState<'administrator' | 'operator' | 'viewer'>('operator');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      setWorkspaceName(currentWorkspace.name);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setMembers(json.data);
      }
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentWorkspace]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !workspaceName) return;

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      });
      if (res.ok) {
        await refreshWorkspaces();
        alert('Workspace name updated successfully!');
      }
    } catch (err) {
      console.error('Update name error:', err);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !inviteIdentifier) return;
    setInviteError(null);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrDiscordId: inviteIdentifier.trim(),
          role: inviteRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to invite member');
      }

      setIsInviteOpen(false);
      setInviteIdentifier('');
      await loadData();
    } catch (err: any) {
      setInviteError(err.message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace?.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Remove member error:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <span>Workspace Settings &amp; Access Roles</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage team roles (Owner, Administrator, Operator, Viewer) and workspace properties.
        </p>
      </div>

      {/* WORKSPACE GENERAL SETTINGS */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-foreground">Workspace Information</h2>
        <form onSubmit={handleUpdateName} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-foreground mb-1">Workspace Name</label>
            <input
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block font-medium text-foreground mb-1">Workspace ID</label>
            <input
              type="text"
              readOnly
              value={currentWorkspace?.id || ''}
              className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-muted-foreground font-mono outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* TEAM MEMBERS & RBAC (PRD Section 3) */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" />
              <span>Workspace Members &amp; Roles</span>
            </h2>
            <p className="text-[11px] text-muted-foreground">Every permission is strictly validated on the server.</p>
          </div>

          <button
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-semibold text-foreground transition"
          >
            <UserPlus className="w-3.5 h-3.5 text-primary" />
            <span>Invite Member</span>
          </button>
        </div>

        <div className="divide-y divide-border/30">
          {members.map((m) => (
            <div key={m.id} className="p-4 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                  {m.user?.username?.[0] || 'U'}
                </div>
                <div>
                  <div className="font-semibold text-foreground">{m.user?.username}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Discord ID: {m.user?.discord_id}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded bg-secondary border border-border text-foreground">
                  {m.role}
                </span>

                {m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INVITE MEMBER MODAL */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setIsInviteOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-foreground mb-1">Invite Workspace Member</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Grant team members access according to the defined Role-Based Access Control matrix.
            </p>

            {inviteError && (
              <div className="p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInviteMember} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1">Username or Discord ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. StudioOperator"
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">Access Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                >
                  <option value="administrator">Administrator (Manage bots, channels, voice)</option>
                  <option value="operator">Operator (Operate voice sessions &amp; send tests)</option>
                  <option value="viewer">Viewer (View-only diagnostics &amp; health)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

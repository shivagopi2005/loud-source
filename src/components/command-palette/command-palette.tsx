'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bot,
  Mic,
  Server,
  Hash,
  MessageSquare,
  AlertOctagon,
  ShieldAlert,
  Activity,
  Settings,
  Layers,
  UserCircle,
  X,
} from 'lucide-react';
import { useWorkspace } from '../providers/workspace-provider';

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: any;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { currentWorkspace, triggerEmergencyStop } = useWorkspace();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands: CommandItem[] = [
    {
      id: 'voice-studio',
      title: 'Open Live Voice Studio',
      category: 'Voice Controls',
      icon: Mic,
      action: () => {
        router.push('/voice');
        onClose();
      },
    },
    {
      id: 'emergency-stop',
      title: 'EMERGENCY STOP (Kill all voice sessions)',
      category: 'Voice Controls',
      icon: AlertOctagon,
      action: async () => {
        await triggerEmergencyStop();
        onClose();
      },
    },
    {
      id: 'fleet',
      title: 'View Bot Fleet',
      category: 'Bot Controls',
      icon: Bot,
      action: () => {
        router.push('/bots');
        onClose();
      },
    },
    {
      id: 'add-bot',
      title: 'Register New Discord Bot',
      category: 'Bot Controls',
      icon: Bot,
      action: () => {
        router.push('/bots?action=new');
        onClose();
      },
    },
    {
      id: 'test-message',
      title: 'Send Text-Channel Test Message',
      category: 'Messaging',
      icon: MessageSquare,
      action: () => {
        router.push('/messaging');
        onClose();
      },
    },
    {
      id: 'announcements',
      title: 'Compose Fleet Announcement',
      category: 'Messaging',
      icon: Layers,
      action: () => {
        router.push('/messaging?tab=announcements');
        onClose();
      },
    },
    {
      id: 'server-setup',
      title: 'Connect Discord Server & Guild',
      category: 'Server Setup',
      icon: Server,
      action: () => {
        router.push('/servers');
        onClose();
      },
    },
    {
      id: 'bot-profiles',
      title: 'Bot Profile & Banner Studio',
      category: 'Bot Fleet',
      icon: UserCircle,
      action: () => {
        router.push('/profiles');
        onClose();
      },
    },
    {
      id: 'channels',
      title: 'Configure Channel Destinations',
      category: 'Server Setup',
      icon: Hash,
      action: () => {
        router.push('/channels');
        onClose();
      },
    },
    {
      id: 'monitoring',
      title: 'Real-time System Monitoring',
      category: 'Diagnostics',
      icon: Activity,
      action: () => {
        router.push('/monitoring');
        onClose();
      },
    },
    {
      id: 'audit-logs',
      title: 'View Security Audit Logs',
      category: 'Diagnostics',
      icon: ShieldAlert,
      action: () => {
        router.push('/audit');
        onClose();
      },
    },
    {
      id: 'settings',
      title: 'Workspace Settings & Team Roles',
      category: 'Workspace Management',
      icon: Settings,
      action: () => {
        router.push('/settings');
        onClose();
      },
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-card">
          <Search className="w-5 h-5 text-muted-foreground mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search actions (e.g., 'voice', 'bot', 'emergency')..."
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-base"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Actions */}
        <div className="overflow-y-auto p-2 divide-y divide-border/30">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No commands found matching &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              const isEmergency = cmd.id === 'emergency-stop';
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition group ${
                    isEmergency
                      ? 'hover:bg-destructive/20 text-destructive'
                      : 'hover:bg-secondary/60 text-foreground'
                  }`}
                >
                  <div
                    className={`p-2 rounded-md mr-3 ${
                      isEmergency
                        ? 'bg-destructive/20 text-destructive'
                        : 'bg-secondary text-muted-foreground group-hover:text-primary transition'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{cmd.title}</div>
                    <div className="text-xs text-muted-foreground">{cmd.category}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-secondary/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Workspace: <strong className="text-foreground">{currentWorkspace?.name}</strong>
          </span>
          <div className="flex items-center space-x-2">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border">ESC</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

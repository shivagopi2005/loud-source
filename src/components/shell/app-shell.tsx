'use client';

import React, { useState } from 'react';
import Link from 'next/navigation';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Mic,
  Server,
  Hash,
  MessageSquare,
  Terminal,
  Clock,
  Activity,
  ShieldAlert,
  CreditCard,
  Settings,
  ChevronDown,
  AlertOctagon,
  Search,
  Radio,
  LogOut,
  User,
  Menu,
} from 'lucide-react';
import { useWorkspace } from '../providers/workspace-provider';
import { CommandPalette } from '../command-palette/command-palette';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspaceId,
    currentUser,
    activeVoiceSession,
    triggerEmergencyStop,
  } = useWorkspace();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const navItems = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Bot Fleet', href: '/bots', icon: Bot },
    {
      label: 'Live Voice Studio',
      href: '/voice',
      icon: Mic,
      badge: activeVoiceSession ? 'LIVE' : undefined,
    },
    { label: 'Servers', href: '/servers', icon: Server },
    { label: 'Channels', href: '/channels', icon: Hash },
    { label: 'Messaging Center', href: '/messaging', icon: MessageSquare },
    { label: 'Command Center', href: '/commands', icon: Terminal },
    { label: 'Automation', href: '/automation', icon: Clock },
    { label: 'Monitoring', href: '/monitoring', icon: Activity },
    { label: 'Audit Logs', href: '/audit', icon: ShieldAlert },
    { label: 'Usage & Billing', href: '/usage', icon: CreditCard },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col antialiased">
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* TOP HEADER */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Platform Brand */}
          <div
            onClick={() => router.push('/')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary group-hover:bg-primary/30 transition">
              <Radio className="w-4 h-4 animate-pulse text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1.5">
                LOUD <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">Studio</span>
              </span>
              <span className="text-[11px] text-muted-foreground">Multi-Bot Discord Control</span>
            </div>
          </div>

          {/* Workspace Selector */}
          <div className="hidden sm:flex items-center pl-4 border-l border-border">
            <select
              value={currentWorkspace?.id || ''}
              onChange={(e) => setCurrentWorkspaceId(e.target.value)}
              className="bg-secondary/60 border border-border rounded-lg text-xs font-medium px-3 py-1.5 text-foreground outline-none hover:bg-secondary transition cursor-pointer"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id} className="bg-card text-foreground">
                  {ws.name} ({ws.planId.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Controls & Emergency Stop */}
        <div className="flex items-center space-x-3">
          {/* Global Quick Search Button */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center space-x-2 text-xs text-muted-foreground bg-secondary/50 hover:bg-secondary border border-border px-3 py-1.5 rounded-lg transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search or command...</span>
            <kbd className="px-1 py-0.5 text-[10px] bg-card rounded border border-border">⌘K</kbd>
          </button>

          {/* Active Voice Pill */}
          {activeVoiceSession && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>VOICE LIVE</span>
            </div>
          )}

          {/* GLOBAL EMERGENCY STOP BUTTON (PRD Section 4.1 & 8.10) */}
          <button
            onClick={triggerEmergencyStop}
            title="Emergency Stop: Instantly kill all audio transmissions and bot voice connections"
            className="flex items-center space-x-1.5 bg-destructive hover:bg-destructive/90 text-white font-bold text-xs uppercase px-3 py-1.5 rounded-lg shadow-lg shadow-destructive/20 transition active:scale-95"
          >
            <AlertOctagon className="w-4 h-4 animate-spin-slow" />
            <span className="hidden sm:inline">Emergency Stop</span>
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-secondary/60 transition border border-transparent hover:border-border"
            >
              {currentUser?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.username}
                  className="w-7 h-7 rounded-full border border-primary/30"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                  {currentUser?.username?.[0] || 'U'}
                </div>
              )}
              <span className="text-xs font-medium hidden lg:inline">{currentUser?.username || 'Operator'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl py-1 z-50 divide-y divide-border/40">
                <div className="px-4 py-2">
                  <div className="text-xs font-semibold text-foreground truncate">{currentUser?.username}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{currentWorkspace?.role}</div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      router.push('/settings');
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-foreground hover:bg-secondary/60 flex items-center space-x-2"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Workspace Settings</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-destructive hover:bg-destructive/10 flex items-center space-x-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside
          className={`${
            isSidebarOpen ? 'w-64' : 'w-20'
          } border-r border-border bg-card/40 transition-all duration-200 flex flex-col shrink-0`}
        >
          <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-primary/15 text-primary border border-primary/20 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                  {isSidebarOpen && (
                    <span className="flex-1 text-left truncate flex items-center justify-between">
                      {item.label}
                      {item.badge && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {item.badge}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick status bar at bottom of sidebar */}
          {isSidebarOpen && (
            <div className="p-3 border-t border-border/40 text-[11px] text-muted-foreground bg-secondary/20">
              <div className="flex items-center justify-between">
                <span>Fleet System</span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-background">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

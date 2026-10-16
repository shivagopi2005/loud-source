'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  LogOut,
  UserCircle,
  Menu,
  X,
  ExternalLink,
  Sliders,
} from 'lucide-react';
import { useWorkspace } from '../providers/workspace-provider';
import { CommandPalette } from '../command-palette/command-palette';

interface NavGroup {
  title: string;
  items: {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspaceId,
    currentUser,
    isLoading,
    activeVoiceSession,
    triggerEmergencyStop,
  } = useWorkspace();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // 1. If on login page, render clean standalone layout without website shell or background
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // 2. Prevent flashing dashboard or operator account before authentication
  if (isLoading || !currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#0d0c14] flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground font-medium">Verifying studio access...</p>
      </div>
    );
  }

  const navGroups: NavGroup[] = [
    {
      title: 'FLEET MANAGEMENT',
      items: [
        { label: 'Overview', href: '/', icon: LayoutDashboard },
        { label: 'Bot Fleet', href: '/bots', icon: Bot },
        { label: 'Bot Profiles', href: '/profiles', icon: UserCircle },
        { label: 'Servers', href: '/servers', icon: Server },
        { label: 'Channels', href: '/channels', icon: Hash },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        {
          label: 'Live Voice Studio',
          href: '/voice',
          icon: Mic,
          badge: activeVoiceSession ? 'LIVE' : undefined,
        },
        { label: 'Command Center', href: '/commands', icon: Terminal },
        { label: 'Messaging Center', href: '/messaging', icon: MessageSquare },
      ],
    },
    {
      title: 'SYSTEM & SETTINGS',
      items: [
        { label: 'Automation', href: '/automation', icon: Clock },
        { label: 'Monitoring', href: '/monitoring', icon: Activity },
        { label: 'Audit Logs', href: '/audit', icon: ShieldAlert },
        { label: 'Usage & Quotas', href: '/usage', icon: CreditCard },
        { label: 'Settings', href: '/settings', icon: Settings },
      ],
    },
  ];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground antialiased selection:bg-primary/20 selection:text-foreground">
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      {/* TOP APP HEADER */}
      <header className="h-14 border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-3 md:px-5">
        <div className="flex items-center space-x-3">
          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Desktop Sidebar Toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden md:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            title="Toggle sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Brand Logo */}
          <Link
            href="/"
            prefetch={true}
            className="flex items-center space-x-2.5 cursor-pointer select-none group"
          >
            <div className="w-7 h-7 rounded-md bg-[#5865F2] flex items-center justify-center text-white shadow-sm font-black text-xs tracking-wider">
              L
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-foreground">
                LOUD
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                Studio
              </span>
            </div>
          </Link>

          {/* Workspace Switcher */}
          <div className="hidden sm:flex items-center pl-3 border-l border-border ml-1">
            <select
              value={currentWorkspace?.id || ''}
              onChange={(e) => setCurrentWorkspaceId(e.target.value)}
              className="bg-secondary/70 border border-border/80 rounded-md text-xs font-medium px-2.5 py-1 text-foreground outline-none hover:bg-secondary focus:border-primary transition cursor-pointer"
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
        <div className="flex items-center space-x-2.5">
          {/* Quick Search */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center space-x-2 text-xs text-muted-foreground bg-secondary/60 hover:bg-secondary border border-border/70 px-2.5 py-1 rounded-md transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-[11px]">Search commands...</span>
            <kbd className="px-1 py-0.2 text-[10px] bg-card rounded border border-border text-muted-foreground">⌘K</kbd>
          </button>

          {/* Active Voice Pill */}
          {activeVoiceSession && (
            <Link
              href="/voice"
              prefetch={true}
              className="cursor-pointer flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/15 transition"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="text-[11px] font-semibold">VOICE LIVE</span>
            </Link>
          )}

          {/* Emergency Stop Button */}
          <button
            onClick={triggerEmergencyStop}
            title="Emergency Stop: Instantly halt audio streaming and voice sessions across all bots"
            className="flex items-center space-x-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs px-2.5 py-1 rounded-md transition active:scale-95 shadow-sm"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">Emergency Stop</span>
          </button>

          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center space-x-2 p-1 rounded-md hover:bg-secondary transition border border-transparent hover:border-border"
            >
              {currentUser?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.username}
                  className="w-6 h-6 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center text-[11px] font-bold">
                  {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <span className="text-xs font-medium hidden lg:inline max-w-[100px] truncate text-foreground">
                {currentUser?.username || 'User'}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-card border border-border rounded-lg shadow-xl py-1 z-50 divide-y divide-border/60">
                <div className="px-3 py-2">
                  <div className="text-xs font-semibold text-foreground truncate">{currentUser?.username}</div>
                  <div className="text-[10px] text-muted-foreground truncate uppercase tracking-wider mt-0.5">
                    {currentWorkspace?.role || 'Member'}
                  </div>
                </div>
                <div className="py-1">
                  <Link
                    href="/profiles"
                    prefetch={true}
                    onClick={() => setIsUserMenuOpen(false)}
                    className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-secondary flex items-center space-x-2"
                  >
                    <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Bot Profiles &amp; Banners</span>
                  </Link>
                  <Link
                    href="/settings"
                    prefetch={true}
                    onClick={() => setIsUserMenuOpen(false)}
                    className="w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-secondary flex items-center space-x-2"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Workspace Settings</span>
                  </Link>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 flex items-center space-x-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* WORKSPACE MAIN BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* DESKTOP SIDEBAR */}
        <aside
          className={`${
            isSidebarOpen ? 'w-56' : 'w-16'
          } border-r border-border bg-card/50 transition-all duration-150 hidden md:flex flex-col shrink-0 select-none`}
        >
          <div className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
            {navGroups.map((group) => (
              <div key={group.title} className="space-y-0.5">
                {isSidebarOpen && (
                  <div className="px-2.5 pb-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      title={!isSidebarOpen ? item.label : undefined}
                      className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                        isActive
                          ? 'bg-[#5865F2]/15 text-[#5865F2] font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#5865F2]' : 'text-muted-foreground'}`} />
                      {isSidebarOpen && (
                        <span className="flex-1 text-left truncate flex items-center justify-between">
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              {item.badge}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Quick status bar at bottom of sidebar */}
          {isSidebarOpen && (
            <div className="p-2.5 border-t border-border/80 text-[11px] text-muted-foreground bg-secondary/30">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[11px]">Discord Gateway</span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* MOBILE DRAWER */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="relative w-64 bg-card border-r border-border p-4 flex flex-col space-y-4 z-10">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="font-bold text-sm text-foreground">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4">
                {navGroups.map((group) => (
                  <div key={group.title} className="space-y-1">
                    <div className="px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch={true}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition ${
                            isActive
                              ? 'bg-[#5865F2]/15 text-[#5865F2] font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CONTENT CANVAS */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

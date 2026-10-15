'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Workspace {
  id: string;
  name: string;
  planId: string;
  status: string;
  role: string;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  discordId: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspaceId: (id: string) => void;
  currentUser: UserProfile | null;
  isLoading: boolean;
  refreshWorkspaces: () => Promise<void>;
  activeVoiceSession: { sessionId: string; state: string } | null;
  setActiveVoiceSession: (session: { sessionId: string; state: string } | null) => void;
  triggerEmergencyStop: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVoiceSession, setActiveVoiceSession] = useState<{
    sessionId: string;
    state: string;
  } | null>(null);

  const fetchSessionData = async () => {
    try {
      // Fetch /api/me
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const json = await meRes.json();
        if (json.success && json.data) {
          setCurrentUser({
            id: json.data.id,
            username: json.data.username,
            avatarUrl: json.data.avatarUrl,
            discordId: json.data.discordId,
          });

          const wsList = json.data.workspaces.map((w: any) => ({
            id: w.id,
            name: w.name,
            planId: w.plan,
            status: w.status,
            role: w.role,
          }));

          setWorkspaces(wsList);
          if (wsList.length > 0) {
            const savedWsId = localStorage.getItem('loud_current_workspace_id');
            const target = wsList.find((w: any) => w.id === savedWsId) || wsList[0];
            setCurrentWorkspace(target);
          }
        }
      } else {
        // If unauthenticated, redirect to /login
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    } catch (err) {
      console.error('[WorkspaceProvider] Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, []);

  const setCurrentWorkspaceId = (id: string) => {
    const target = workspaces.find((w) => w.id === id);
    if (target) {
      setCurrentWorkspace(target);
      localStorage.setItem('loud_current_workspace_id', target.id);
    }
  };

  const triggerEmergencyStop = async () => {
    setActiveVoiceSession(null);
    try {
      const stopTasks: Promise<any>[] = [
        fetch('/api/fleet/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace?.id }),
        }),
        fetch('/api/fleet/force-disconnect-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      ];
      if (activeVoiceSession) {
        stopTasks.push(
          fetch(`/api/voice-sessions/${activeVoiceSession.sessionId}/emergency-stop`, {
            method: 'POST',
          })
        );
      }
      await Promise.allSettled(stopTasks);
    } catch (err) {
      console.error('Emergency stop error:', err);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setCurrentWorkspaceId,
        currentUser,
        isLoading,
        refreshWorkspaces: fetchSessionData,
        activeVoiceSession,
        setActiveVoiceSession,
        triggerEmergencyStop,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

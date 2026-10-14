'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  User,
  X,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function AuditLogsPage() {
  const { currentWorkspace } = useWorkspace();
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadEvents = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/audit-events?workspaceId=${currentWorkspace.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setEvents(json.data);
      }
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [currentWorkspace]);

  const filtered = events.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actorName?.toLowerCase().includes(search.toLowerCase()) ||
      e.correlationId?.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            <span>Immutable Security Audit Logs</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Complete compliance trail of bot registrations, voice sessions, emergency halts, and credential rotations.
          </p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="flex items-center bg-card p-3 rounded-xl border border-border">
        <div className="flex items-center bg-secondary/60 rounded-lg px-3 py-1.5 border border-border flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground mr-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, actor, or correlation ID..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* AUDIT TABLE */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5 font-semibold">Timestamp</th>
                <th className="p-3.5 font-semibold">Action</th>
                <th className="p-3.5 font-semibold">Actor</th>
                <th className="p-3.5 font-semibold">Resource</th>
                <th className="p-3.5 font-semibold">Result</th>
                <th className="p-3.5 font-semibold">Correlation ID</th>
                <th className="p-3.5 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-secondary/30 transition">
                    <td className="p-3.5 text-muted-foreground whitespace-nowrap">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-primary">{ev.action}</td>
                    <td className="p-3.5 font-medium">{ev.actorName || ev.actorType}</td>
                    <td className="p-3.5 capitalize text-muted-foreground">{ev.resourceType}</td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                          ev.result === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        }`}
                      >
                        {ev.result}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                      {ev.correlationId?.slice(0, 8)}...
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        className="text-xs bg-secondary hover:bg-secondary/80 border border-border px-2.5 py-1 rounded transition"
                      >
                        View JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* METADATA INSPECTOR MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-sm font-bold text-foreground mb-1">
              Audit Event Payload: <span className="text-primary">{selectedEvent.action}</span>
            </h3>
            <p className="text-xs text-muted-foreground mb-4 font-mono">
              Correlation ID: {selectedEvent.correlationId}
            </p>

            <pre className="p-4 rounded-lg bg-secondary text-foreground text-xs font-mono overflow-x-auto max-h-80">
              {JSON.stringify(selectedEvent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function AuditLogsPage() {
  const { currentWorkspace } = useWorkspace();
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(30); // Strictly 30 per page
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        workspaceId: currentWorkspace.id,
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search.trim()) params.append('search', search.trim());
      if (actionFilter !== 'all') params.append('action', actionFilter);
      if (resultFilter !== 'all') params.append('result', resultFilter);

      const res = await fetch(`/api/audit-events?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          if (Array.isArray(json.data)) {
            setEvents(json.data);
            setTotalCount(json.data.length);
            setTotalPages(Math.max(1, Math.ceil(json.data.length / limit)));
          } else if (json.data.events) {
            setEvents(json.data.events);
            setTotalPages(json.data.pagination.totalPages || 1);
            setTotalCount(json.data.pagination.total || 0);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, page, limit, search, actionFilter, resultFilter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Handle Search input change with page reset
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActionFilter(e.target.value);
    setPage(1);
  };

  const handleResultChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setResultFilter(e.target.value);
    setPage(1);
  };

  const handleCopyJson = () => {
    if (!selectedEvent) return;
    navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `audit_logs_workspace_${currentWorkspace?.id || 'export'}_page${page}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const startRecord = (page - 1) * limit + (totalCount > 0 ? 1 : 0);
  const endRecord = Math.min(page * limit, totalCount);

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

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadEvents()}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition active:scale-95"
            title="Refresh logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleExportJson}
            disabled={events.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium border border-border transition active:scale-95 disabled:opacity-50"
            title="Export page JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* FILTER & CONTROLS TOOLBAR */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-card p-3 rounded-xl border border-border">
        {/* Search Input */}
        <div className="sm:col-span-6 flex items-center bg-secondary/60 rounded-lg px-3 py-1.5 border border-border">
          <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search by action, correlation ID, or resource..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Category Filter */}
        <div className="sm:col-span-3">
          <select
            value={actionFilter}
            onChange={handleActionChange}
            className="w-full bg-secondary/60 border border-border rounded-lg text-xs px-2.5 py-1.5 text-foreground outline-none cursor-pointer"
          >
            <option value="all">All Actions</option>
            <option value="voice">Voice Sessions (voice.*)</option>
            <option value="bot">Bot Fleet (bot.*)</option>
            <option value="auth">Authentication (auth.*)</option>
            <option value="message">Messaging (message.*)</option>
            <option value="workspace">Workspace (workspace.*)</option>
          </select>
        </div>

        {/* Result Filter */}
        <div className="sm:col-span-3">
          <select
            value={resultFilter}
            onChange={handleResultChange}
            className="w-full bg-secondary/60 border border-border rounded-lg text-xs px-2.5 py-1.5 text-foreground outline-none cursor-pointer"
          >
            <option value="all">All Results</option>
            <option value="success">Success Only</option>
            <option value="failure">Failure / Error Only</option>
          </select>
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
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading audit events (30 items/page)...</span>
                    </div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <FileText className="w-8 h-8 text-muted-foreground/40 mb-1" />
                      <p className="font-semibold text-foreground">No audit records found</p>
                      <p className="text-xs text-muted-foreground">Try clearing search filters or selecting another action.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-secondary/30 transition">
                    <td className="p-3.5 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                      {new Date(ev.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-mono font-semibold text-primary">{ev.action}</td>
                    <td className="p-3.5 font-medium flex items-center space-x-1.5">
                      {ev.actorAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ev.actorAvatar}
                          alt={ev.actorName}
                          className="w-5 h-5 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-secondary text-muted-foreground flex items-center justify-center text-[10px]">
                          <User className="w-3 h-3" />
                        </div>
                      )}
                      <span>{ev.actorName || ev.actorType}</span>
                    </td>
                    <td className="p-3.5 capitalize text-muted-foreground">{ev.resourceType}</td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                          ev.result === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-destructive/10 text-destructive border-destructive/20'
                        }`}
                      >
                        {ev.result === 'success' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        <span>{ev.result}</span>
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

        {/* PAGINATION BAR (Strictly 30 per page) */}
        <div className="bg-secondary/20 border-t border-border px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-foreground">{startRecord}</strong> to{' '}
              <strong className="text-foreground">{endRecord}</strong> of{' '}
              <strong className="text-foreground">{totalCount}</strong> audit events
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-secondary text-[11px] font-semibold text-foreground/80 border border-border">
              30 per page
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed border border-border flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            {/* Page number pill */}
            <div className="px-3 py-1 text-xs font-semibold text-foreground bg-secondary/80 rounded border border-border">
              Page {page} of {totalPages}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground disabled:opacity-40 disabled:cursor-not-allowed border border-border flex items-center gap-1 transition"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* METADATA INSPECTOR MODAL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-xl w-full p-6 relative">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between pr-8 mb-2">
              <h3 className="text-sm font-bold text-foreground">
                Audit Event Payload: <span className="text-primary font-mono">{selectedEvent.action}</span>
              </h3>
            </div>
            
            <p className="text-xs text-muted-foreground mb-4 font-mono">
              Correlation ID: <span className="text-foreground">{selectedEvent.correlationId}</span>
            </p>

            <div className="relative">
              <pre className="p-4 rounded-lg bg-secondary/80 border border-border text-foreground text-xs font-mono overflow-x-auto max-h-96">
                {JSON.stringify(selectedEvent, null, 2)}
              </pre>
              <button
                onClick={handleCopyJson}
                className="absolute top-2 right-2 px-2.5 py-1 rounded bg-card/90 hover:bg-card border border-border text-[11px] font-medium text-foreground flex items-center gap-1 transition shadow-sm"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs font-semibold border border-border transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

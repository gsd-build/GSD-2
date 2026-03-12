/**
 * SessionTabs — horizontal tab bar for multi-session chat.
 *
 * Shows up to 4 session tabs with processing indicators,
 * inline rename on double-click, close buttons, and a "+" create button.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SESSIONS } from "@/server/types";
import type { SessionTab } from "@/hooks/useSessionManager";

interface SessionTabsProps {
  sessions: SessionTab[];
  activeSessionId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
}

export function SessionTabs({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
  onCreate,
  onRename,
}: SessionTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startRename = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRename]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 border-b border-navy-600 bg-navy-900/50 px-2 py-1">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isEditing = editingId === session.id;

        return (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session.id)}
            onDoubleClick={() => startRename(session.id, session.name)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-mono transition-colors group",
              isActive
                ? "bg-navy-800 text-cyan-accent border-b-2 border-cyan-accent"
                : "text-slate-400 hover:bg-navy-700",
            )}
          >
            {/* Processing indicator */}
            {session.isProcessing && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            )}

            {/* Tab name or inline edit */}
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-20 bg-navy-700 border border-navy-500 rounded px-1 py-0.5 text-xs text-slate-200 outline-none focus:border-cyan-accent"
              />
            ) : (
              <span className="truncate max-w-[100px]">{session.name}</span>
            )}

            {/* Close button */}
            {sessions.length > 1 && !isEditing && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className={cn(
                  "shrink-0 rounded p-0.5 transition-colors",
                  isActive
                    ? "text-slate-500 hover:text-slate-200 hover:bg-navy-600"
                    : "text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-300 hover:bg-navy-600",
                )}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}

      {/* Create session button */}
      {sessions.length < MAX_SESSIONS && (
        <button
          type="button"
          onClick={onCreate}
          className="shrink-0 rounded p-1.5 text-slate-500 hover:text-slate-300 hover:bg-navy-700 transition-colors"
          title="New session"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

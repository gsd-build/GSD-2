/**
 * InlineReadPanel — modal overlay for displaying file content
 * when view_plan / view_task / view_diff / view_uat_results is triggered.
 */
import { X } from "lucide-react";

interface InlineReadPanelProps {
  isOpen: boolean;
  title: string;
  content: string;
  isLoading: boolean;
  onClose: () => void;
}

export function InlineReadPanel({ isOpen, title, content, isLoading, onClose }: InlineReadPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="inline-read-panel"
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-lg overflow-hidden"
        style={{ width: "80vw", height: "80vh", background: "#131A21", border: "1px solid #2D3B4E" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0 px-4"
          style={{ height: "44px", borderBottom: "1px solid #2D3B4E", background: "#0F1419" }}
        >
          <span className="font-mono text-sm text-slate-200 font-bold">{title}</span>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <span className="font-mono text-xs text-slate-500">Loading...</span>
          ) : (
            <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap break-words">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

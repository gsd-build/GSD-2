/**
 * Sidebar — VS Code-style sidebar with project tree navigation.
 *
 * - GsdLogo + Projects label + collapse toggle (top)
 * - New Window + Open Folder action buttons
 * - ProjectTree with nav items
 * - ConnectionStatus (bottom)
 */
import { useCallback } from "react";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { PanelLeftClose, PanelLeft, ExternalLink, FolderOpen, Settings, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAYOUT_DEFAULTS } from "@/styles/design-tokens";
import { GsdLogo } from "@/components/sidebar/GsdLogo";
import { ProjectTree } from "@/components/sidebar/ProjectTree";
import { ConnectionStatus } from "@/components/sidebar/ConnectionStatus";
import type { ConnectionStatus as ConnectionStatusType } from "@/hooks/useReconnectingWebSocket";
import type { ProjectState, ConfigState } from "@/server/types";
import type { ViewType } from "@/lib/view-types";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  connectionStatus: ConnectionStatusType;
  projectState: ProjectState | null;
  configState: ConfigState | null;
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  onOpenFolder: () => void;
  /** Navigate back to the project home screen. */
  onGoHome?: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  connectionStatus,
  projectState,
  configState,
  activeView,
  onSelectView,
  onOpenFolder,
  onGoHome,
}: SidebarProps) {
  const handleNewWindow = useCallback(() => {
    window.open(location.href, "_blank");
  }, []);

  const { updateReady, installing, installUpdate } = useAppUpdater();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-navy-600 bg-navy-900 transition-all duration-200",
      )}
      style={{
        width: collapsed
          ? LAYOUT_DEFAULTS.sidebarCollapsedWidth
          : LAYOUT_DEFAULTS.sidebarWidth,
        minWidth: collapsed
          ? LAYOUT_DEFAULTS.sidebarCollapsedWidth
          : LAYOUT_DEFAULTS.sidebarWidth,
      }}
    >
      {/* Home button — shown when onGoHome prop is provided (WORKSPACE-02) */}
      {onGoHome && (
        <div className="border-b border-navy-600 p-2">
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Home"
            title="Home"
            className="flex min-h-[44px] w-full items-center gap-2 rounded p-2 text-sm text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
          >
            <Home className="h-4 w-4" />
            {!collapsed && <span>Home</span>}
          </button>
        </div>
      )}

      {/* Top: Logo + label + collapse toggle */}
      <div className="flex items-center gap-2 border-b border-navy-600 p-2">
        <GsdLogo className="h-6 w-6 text-cyan-accent" />
        {!collapsed && (
          <span className="flex-1 font-display text-xs uppercase tracking-wider text-slate-400">
            Projects
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Action buttons — vertically stacked */}
      {!collapsed && (
        <div className="flex flex-col gap-1 border-b border-navy-600 p-2">
          <button
            type="button"
            onClick={handleNewWindow}
            className="flex min-h-[44px] items-center gap-2 rounded p-2 text-xs text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
            title="New Window"
          >
            <ExternalLink className="h-4 w-4" />
            <span>New Window</span>
          </button>
          <button
            type="button"
            onClick={onOpenFolder}
            className="flex min-h-[44px] items-center gap-2 rounded p-2 text-xs text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
            title="Open Folder"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Open Folder</span>
          </button>
        </div>
      )}

      {/* Body: Project tree */}
      <div className="flex-1 overflow-auto">
        {!collapsed && (
          <ProjectTree
            projectState={projectState}
            activeView={activeView}
            onSelectView={onSelectView}
          />
        )}
      </div>

      {/* Settings gear icon */}
      <div className="border-t border-navy-600 p-2">
        <button
          type="button"
          onClick={() => onSelectView({ kind: "settings" })}
          aria-label="Settings"
          title="Settings"
          className={cn(
            "flex min-h-[44px] w-full items-center gap-2 rounded p-2 text-sm transition-colors hover:bg-navy-700",
            activeView.kind === "settings"
              ? "text-cyan-accent"
              : "text-slate-400 hover:text-slate-300",
          )}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>

      {/* Update notification — shown when background download is complete */}
      {updateReady && (
        <div
          className="border-t p-2"
          style={{ borderColor: '#1E2D3D', backgroundColor: '#131C2B' }}
        >
          <button
            type="button"
            onClick={installUpdate}
            disabled={installing}
            title="Restart to apply update"
            className="flex w-full items-center gap-2 rounded p-2 text-xs transition-colors hover:bg-navy-700"
            style={{ color: '#5BC8F0' }}
          >
            <span style={{ fontSize: '10px' }}>↑</span>
            {!collapsed && (
              <span>{installing ? 'Installing…' : 'Update ready — restart to apply'}</span>
            )}
          </button>
        </div>
      )}

      {/* Bottom: Connection status */}
      <div className="border-t border-navy-600 p-2">
        <ConnectionStatus
          status={connectionStatus}
          modelProfile={configState?.model_profile}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}

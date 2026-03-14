/**
 * ProjectTabBar — horizontal tab bar shown when 2+ projects are open.
 *
 * Hidden when openProjects.length < 2.
 * Active tab has a cyan bottom border (#5BC8F0).
 * Executing projects (isProcessing: true) show an amber dot (#F59E0B) before the name.
 */
import type { FC } from "react";

export interface OpenProject {
  id: string;
  path?: string;
  name: string;
  isProcessing: boolean;
  isActive?: boolean;
}

export interface ProjectTabBarProps {
  openProjects: OpenProject[];
  onSwitchProject?: (id: string) => void;
}

/**
 * ProjectTabBar — renders null when fewer than 2 projects are open.
 */
const ProjectTabBar: FC<ProjectTabBarProps> = ({ openProjects, onSwitchProject }) => {
  if (openProjects.length < 2) return null;

  return (
    <div
      style={{
        display: "flex",
        background: "#131C2B",
        borderBottom: "1px solid #1E2D3D",
        flexShrink: 0,
      }}
    >
      {openProjects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSwitchProject?.(p.path ?? p.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            background: "transparent",
            border: "none",
            borderBottom: p.isActive ? "2px solid #5BC8F0" : "2px solid transparent",
            color: p.isActive ? "#5BC8F0" : "#8899AA",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {p.isProcessing && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#F59E0B",
                display: "inline-block",
              }}
              aria-label="processing"
            />
          )}
          {p.name}
        </button>
      ))}
    </div>
  );
};

export default ProjectTabBar;

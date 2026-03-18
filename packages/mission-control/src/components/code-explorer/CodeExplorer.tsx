/**
 * CodeExplorer — full-screen modal with file tree + CodeMirror editor.
 * Opens from sidebar <> button, scoped to projectRoot.
 * Reads via GET /api/fs/read, saves via POST /api/fs/write.
 *
 * Features:
 *  - Syntax highlighting (CodeMirror + oneDark)
 *  - Line numbers + active-line borders
 *  - Markdown preview toggle (.md files)
 *  - Multi-file dirty tracking (Save All)
 *  - Fullscreen toggle
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Copy, Save, Maximize2, Minimize2, Eye, EyeOff } from "lucide-react";
import { marked } from "marked";
import { FileTree } from "./FileTree";
import { FileEditor } from "./FileEditor";
import { useCodeExplorer } from "./useCodeExplorer";
import { useGitStatus } from "./useGitStatus";

interface CodeExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string;
}

/** Simple markdown prose styles injected as a style tag. */
const MARKDOWN_PROSE_STYLES = `
.md-preview h1 { font-size: 1.5em; font-weight: 700; color: #e2e8f0; margin: 0.75em 0 0.4em; border-bottom: 1px solid #1E2D3D; padding-bottom: 0.25em; }
.md-preview h2 { font-size: 1.25em; font-weight: 600; color: #cbd5e1; margin: 0.75em 0 0.35em; border-bottom: 1px solid #1E2D3D; padding-bottom: 0.2em; }
.md-preview h3 { font-size: 1.05em; font-weight: 600; color: #94a3b8; margin: 0.65em 0 0.3em; }
.md-preview p { color: #94a3b8; margin: 0.5em 0; line-height: 1.65; }
.md-preview ul, .md-preview ol { color: #94a3b8; margin: 0.4em 0 0.4em 1.4em; }
.md-preview li { margin: 0.2em 0; line-height: 1.6; }
.md-preview code { background: #1E2D3D; color: #5BC8F0; font-family: monospace; font-size: 0.85em; padding: 0.15em 0.4em; border-radius: 3px; }
.md-preview pre { background: #0F1419; border: 1px solid #1E2D3D; border-radius: 6px; padding: 1em; overflow-x: auto; margin: 0.6em 0; }
.md-preview pre code { background: none; color: #e2e8f0; padding: 0; font-size: 0.8em; }
.md-preview blockquote { border-left: 3px solid #5BC8F0; margin: 0.5em 0; padding-left: 0.8em; color: #64748b; }
.md-preview a { color: #5BC8F0; text-decoration: underline; }
.md-preview hr { border: none; border-top: 1px solid #1E2D3D; margin: 1em 0; }
.md-preview table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
.md-preview th, .md-preview td { border: 1px solid #1E2D3D; padding: 0.4em 0.7em; color: #94a3b8; }
.md-preview th { background: #131C2B; color: #cbd5e1; font-weight: 600; }
`;

function isMarkdownFile(path: string | null): boolean {
  if (!path) return false;
  const ext = path.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  return ext === "md" || ext === "markdown";
}

export function CodeExplorer({ isOpen, onClose, projectRoot }: CodeExplorerProps) {
  const { selectedFile, selectFile } = useCodeExplorer();
  const gitStatus = useGitStatus(projectRoot, isOpen);

  // Multi-file dirty tracking: Map<filePath, dirtyContent>
  const dirtyFilesRef = useRef<Map<string, string>>(new Map());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [currentDirty, setCurrentDirty] = useState(false);

  const [fileContent, setFileContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const selectedFileRef = useRef<string | null>(null);
  const fileContentRef = useRef("");
  fileContentRef.current = fileContent;

  // When selected file changes — save current dirty content, load new file
  useEffect(() => {
    if (!selectedFile) return;

    // Reset preview for non-markdown files
    if (!isMarkdownFile(selectedFile)) setPreviewMode(false);

    setLoading(true);
    setSaveError(null);

    // Check if this file has unsaved content in our dirty map
    const dirtyContent = dirtyFilesRef.current.get(selectedFile);
    if (dirtyContent !== undefined) {
      setFileContent(dirtyContent);
      setCurrentDirty(true);
      setLoading(false);
      selectedFileRef.current = selectedFile;
      return;
    }

    fetch("/api/fs/read?path=" + encodeURIComponent(selectedFile))
      .then((res) => res.json())
      .then((data) => {
        setFileContent(data.content ?? "");
        setCurrentDirty(false);
      })
      .catch(() => {
        setFileContent("(error loading file)");
        setCurrentDirty(false);
      })
      .finally(() => {
        setLoading(false);
        selectedFileRef.current = selectedFile;
      });
  }, [selectedFile]);

  const handleChange = useCallback((content: string) => {
    setFileContent(content);
    const path = selectedFileRef.current;
    if (!path) return;
    dirtyFilesRef.current.set(path, content);
    setCurrentDirty(true);
    setDirtyCount(dirtyFilesRef.current.size);
    setSaveError(null);
  }, []);

  const saveFile = useCallback(async (path: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/fs/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (res.ok) {
        dirtyFilesRef.current.delete(path);
        return true;
      }
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error ?? "Save failed");
      return false;
    } catch (err: any) {
      setSaveError(err.message ?? "Save failed");
      return false;
    }
  }, []);

  const handleSave = useCallback(async () => {
    const path = selectedFileRef.current;
    if (!path || !currentDirty) return;
    setSaving(true);
    setSaveError(null);
    const ok = await saveFile(path, fileContentRef.current);
    if (ok) {
      setCurrentDirty(false);
      setDirtyCount(dirtyFilesRef.current.size);
    }
    setSaving(false);
  }, [currentDirty, saveFile]);

  const handleSaveAll = useCallback(async () => {
    if (dirtyFilesRef.current.size === 0) return;
    setSavingAll(true);
    setSaveError(null);
    const entries = [...dirtyFilesRef.current.entries()];
    await Promise.all(entries.map(([path, content]) => saveFile(path, content)));
    const currentPath = selectedFileRef.current;
    if (currentPath && !dirtyFilesRef.current.has(currentPath)) {
      setCurrentDirty(false);
    }
    setDirtyCount(dirtyFilesRef.current.size);
    setSavingAll(false);
  }, [saveFile]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleCopyPath = useCallback(() => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile).catch(() => {});
    }
  }, [selectedFile]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  }, [handleClose]);

  const handleSelectFile = useCallback((path: string) => {
    // Capture current dirty state before switching
    const currentPath = selectedFileRef.current;
    if (currentPath && currentDirty) {
      dirtyFilesRef.current.set(currentPath, fileContentRef.current);
      setDirtyCount(dirtyFilesRef.current.size);
    }
    selectFile(path);
  }, [currentDirty, selectFile]);

  if (!isOpen) return null;

  const fileName = selectedFile
    ? selectedFile.replace(/\\/g, "/").split("/").pop() ?? selectedFile
    : null;

  const isMarkdown = isMarkdownFile(selectedFile);
  const showSaveAll = dirtyCount > 1;

  const modalStyle: React.CSSProperties = fullscreen
    ? { width: "100vw", height: "100vh", borderRadius: 0, background: "#131A21", border: "1px solid #2D3B4E" }
    : { width: "95vw", height: "90vh", background: "#131A21", border: "1px solid #2D3B4E" };

  const outerClass = fullscreen
    ? "fixed inset-0 z-50"
    : "fixed inset-0 z-50 flex items-center justify-center";

  return (
    <>
      {/* Markdown prose styles */}
      <style>{MARKDOWN_PROSE_STYLES}</style>

      <div
        className={outerClass}
        style={fullscreen ? {} : { background: "rgba(0,0,0,0.8)" }}
        onClick={handleBackdropClick}
      >
        <div
          className="flex flex-col rounded-lg overflow-hidden"
          style={modalStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 shrink-0"
            style={{ height: "44px", borderBottom: "1px solid #2D3B4E", background: "#0F1419" }}
          >
            <span className="text-sm font-medium text-slate-300">Code Explorer</span>
            {selectedFile && (
              <>
                <span className="text-slate-600 mx-1">/</span>
                <span className="text-xs font-mono text-slate-400 truncate max-w-[400px]" title={selectedFile}>
                  {fileName}
                </span>
                {currentDirty && (
                  <span className="text-xs text-status-warning ml-1" title="Unsaved changes">•</span>
                )}
              </>
            )}
            <div className="flex-1" />
            {saveError && (
              <span className="text-xs text-status-error mr-2">{saveError}</span>
            )}
            {/* Markdown preview toggle */}
            {isMarkdown && (
              <button
                type="button"
                onClick={() => setPreviewMode((p) => !p)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
                title={previewMode ? "Edit" : "Preview"}
              >
                {previewMode ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                <span>{previewMode ? "Edit" : "Preview"}</span>
              </button>
            )}
            {/* Copy path */}
            {selectedFile && (
              <button
                type="button"
                onClick={handleCopyPath}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
                title="Copy file path"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {/* Save current file */}
            {currentDirty && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-accent transition-colors hover:bg-navy-700 disabled:opacity-50"
                title="Save (Ctrl+S)"
              >
                <Save className="h-3 w-3" />
                <span>{saving ? "Saving…" : "Save"}</span>
              </button>
            )}
            {/* Save all dirty files */}
            {showSaveAll && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savingAll}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#F59E0B] transition-colors hover:bg-navy-700 disabled:opacity-50"
                title="Save all modified files"
              >
                <Save className="h-3 w-3" />
                <span>{savingAll ? "Saving…" : `Save All (${dirtyCount})`}</span>
              </button>
            )}
            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              className="flex items-center justify-center h-7 w-7 rounded text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center justify-center h-7 w-7 rounded text-slate-400 transition-colors hover:bg-navy-700 hover:text-slate-300"
              aria-label="Close Code Explorer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body: tree + editor */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: File tree */}
            <div
              className="shrink-0 overflow-hidden"
              style={{ width: "256px", borderRight: "1px solid #2D3B4E" }}
            >
              {projectRoot ? (
                <FileTree
                  projectRoot={projectRoot}
                  onSelectFile={handleSelectFile}
                  selectedFile={selectedFile}
                  gitStatus={gitStatus}
                />
              ) : (
                <div className="p-4 text-xs text-slate-500">No project open</div>
              )}
            </div>

            {/* Right: Editor or Markdown preview */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {loading ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Loading…
                </div>
              ) : selectedFile ? (
                isMarkdown && previewMode ? (
                  <div
                    className="md-preview p-6 overflow-auto h-full text-sm"
                    style={{ background: "#131A21" }}
                    dangerouslySetInnerHTML={{ __html: marked.parse(fileContent) as string }}
                  />
                ) : (
                  <FileEditor
                    content={fileContent}
                    filePath={selectedFile}
                    onChange={handleChange}
                    onSave={handleSave}
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Select a file from the tree
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

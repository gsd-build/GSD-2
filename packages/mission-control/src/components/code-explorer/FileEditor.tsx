/**
 * FileEditor — CodeMirror 6 editor with syntax highlighting, line numbers,
 * active-line borders, and VS Code dark theme.
 *
 * Language is auto-detected from filePath extension.
 * External content changes (file switch) are applied without triggering onChange.
 */
import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { basicSetup } from "@codemirror/basic-setup";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";

interface FileEditorProps {
  content: string;
  filePath: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

/** Returns true if the content appears to be binary (contains null bytes). */
function isBinaryContent(content: string): boolean {
  return content.slice(0, 8192).includes("\0");
}

const MAX_FILE_SIZE = 500_000; // 500KB

/** Detect CodeMirror language extension by file extension. */
function getLanguageExtension(filePath: string) {
  const ext = filePath.replace(/\\/g, "/").split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "css":
    case "scss":
    case "sass":
      return css();
    case "json":
      return json();
    case "py":
      return python();
    case "md":
    case "markdown":
      return markdown();
    default:
      return null;
  }
}

/** Custom theme additions — VS Code-style active line borders + gutter styling. */
const vsCodeTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace",
    lineHeight: "1.6",
  },
  ".cm-activeLine": {
    borderTop: "1px solid rgba(255,255,255,0.07)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03) !important",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#5BC8F0",
  },
  ".cm-gutters": {
    borderRight: "1px solid #1E2D3D",
    backgroundColor: "#0F1419",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#3D5166",
    paddingRight: "12px",
  },
  ".cm-cursor": {
    borderLeftColor: "#5BC8F0",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(91,200,240,0.2) !important",
  },
});

export function FileEditor({ content, filePath, onChange, onSave }: FileEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);
  const onChangeRef = useRef(onChange);
  const isExternalUpdate = useRef(false);
  const langCompartment = useRef(new Compartment());

  // Keep refs up to date
  onSaveRef.current = onSave;
  onChangeRef.current = onChange;

  // Build editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(filePath);

    const saveKeymap = keymap.of([
      {
        key: "Ctrl-s",
        mac: "Mod-s",
        run: () => { onSaveRef.current(); return true; },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        highlightActiveLine(),
        highlightActiveLineGutter(),
        saveKeymap,
        oneDark,
        vsCodeTheme,
        langCompartment.current.of(langExt ?? []),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only recreate on mount/unmount — content and filePath updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update language when filePath changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const langExt = getLanguageExtension(filePath);
    view.dispatch({
      effects: langCompartment.current.reconfigure(langExt ?? []),
    });
  }, [filePath]);

  // Sync external content prop → editor (e.g. when a new file is loaded)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === content) return; // already in sync — no-op
    isExternalUpdate.current = true;
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: content },
    });
    isExternalUpdate.current = false;
  }, [content]);

  // Ctrl+S handler kept in sync via ref — no effect needed

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    },
    [],
  );

  if (isBinaryContent(content)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Binary file — cannot display
      </div>
    );
  }
  if (content.length > MAX_FILE_SIZE) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        File too large to display ({Math.round(content.length / 1024)}KB)
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto"
      onKeyDown={handleKeyDown}
    />
  );
}

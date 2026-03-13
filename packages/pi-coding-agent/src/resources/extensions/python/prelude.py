"""
GSD Python prelude — helper functions injected into every IPython kernel session.

All helpers use IPython.display.display() for structured status output via the
application/x-gsd-status MIME type.
"""

import os
import sys
import json
import shutil
import subprocess
import re
from pathlib import Path
from collections import Counter as _Counter
from typing import Optional, List, Union

try:
    from IPython.display import display as _display
except ImportError:
    def _display(*args, **kwargs):
        for a in args:
            print(a)


def _emit_status(status: str, **kwargs):
    """Emit a structured status message via display."""
    data = {"status": status, **kwargs}
    _display(data, raw=True, metadata={}, include=["application/x-gsd-status"])


# ============================================================================
# File I/O
# ============================================================================

def read(path: str, encoding: str = "utf-8") -> str:
    """Read a file and return its contents as a string."""
    p = Path(path).expanduser().resolve()
    return p.read_text(encoding=encoding)


def write(path: str, content: str, encoding: str = "utf-8") -> None:
    """Write content to a file, creating parent directories as needed."""
    p = Path(path).expanduser().resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding=encoding)
    _emit_status("written", path=str(p), bytes=len(content.encode(encoding)))


def append(path: str, content: str, encoding: str = "utf-8") -> None:
    """Append content to a file."""
    p = Path(path).expanduser().resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding=encoding) as f:
        f.write(content)
    _emit_status("appended", path=str(p), bytes=len(content.encode(encoding)))


# ============================================================================
# File operations
# ============================================================================

def rm(path: str, recursive: bool = False) -> None:
    """Remove a file or directory."""
    p = Path(path).expanduser().resolve()
    if p.is_dir():
        if recursive:
            shutil.rmtree(p)
        else:
            p.rmdir()
    else:
        p.unlink()
    _emit_status("removed", path=str(p))


def mv(src: str, dst: str) -> None:
    """Move/rename a file or directory."""
    s = Path(src).expanduser().resolve()
    d = Path(dst).expanduser().resolve()
    d.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(s), str(d))
    _emit_status("moved", src=str(s), dst=str(d))


def cp(src: str, dst: str, recursive: bool = False) -> None:
    """Copy a file or directory."""
    s = Path(src).expanduser().resolve()
    d = Path(dst).expanduser().resolve()
    d.parent.mkdir(parents=True, exist_ok=True)
    if s.is_dir() and recursive:
        shutil.copytree(str(s), str(d))
    else:
        shutil.copy2(str(s), str(d))
    _emit_status("copied", src=str(s), dst=str(d))


# ============================================================================
# Search
# ============================================================================

def find(
    path: str = ".",
    name: Optional[str] = None,
    pattern: Optional[str] = None,
    type: Optional[str] = None,
    max_depth: Optional[int] = None,
    limit: int = 200,
) -> List[str]:
    """Find files/directories matching criteria.

    Args:
        path: Root directory to search
        name: Exact filename to match
        pattern: Glob pattern to match (e.g., '*.py')
        type: 'f' for files, 'd' for directories
        max_depth: Maximum directory depth
        limit: Maximum results
    """
    root = Path(path).expanduser().resolve()
    results = []

    def _walk(p: Path, depth: int):
        if max_depth is not None and depth > max_depth:
            return
        if len(results) >= limit:
            return
        try:
            for entry in sorted(p.iterdir()):
                if len(results) >= limit:
                    return
                if name and entry.name != name:
                    if not entry.is_dir():
                        continue
                if pattern and not entry.match(pattern):
                    if not entry.is_dir():
                        continue
                if type == "f" and not entry.is_file():
                    if entry.is_dir():
                        _walk(entry, depth + 1)
                    continue
                if type == "d" and not entry.is_dir():
                    continue

                skip = False
                if name and entry.name != name:
                    skip = True
                if pattern and not entry.match(pattern):
                    skip = True

                if not skip:
                    results.append(str(entry))

                if entry.is_dir():
                    _walk(entry, depth + 1)
        except PermissionError:
            pass

    _walk(root, 0)
    return results


def grep(
    pattern: str,
    path: str = ".",
    recursive: bool = False,
    ignore_case: bool = False,
    max_results: int = 100,
) -> List[dict]:
    """Search for a regex pattern in files.

    Returns list of dicts with 'file', 'line', 'text' keys.
    """
    flags = re.IGNORECASE if ignore_case else 0
    regex = re.compile(pattern, flags)
    root = Path(path).expanduser().resolve()
    results = []

    def _search_file(fp: Path):
        try:
            for i, line in enumerate(fp.read_text(errors="replace").splitlines(), 1):
                if len(results) >= max_results:
                    return
                if regex.search(line):
                    results.append({"file": str(fp), "line": i, "text": line.rstrip()})
        except (PermissionError, IsADirectoryError, UnicodeDecodeError):
            pass

    if root.is_file():
        _search_file(root)
    elif recursive:
        for fp in sorted(root.rglob("*")):
            if fp.is_file():
                _search_file(fp)
                if len(results) >= max_results:
                    break
    else:
        for fp in sorted(root.iterdir()):
            if fp.is_file():
                _search_file(fp)
                if len(results) >= max_results:
                    break

    return results


def rgrep(pattern: str, path: str = ".", **kwargs) -> List[dict]:
    """Recursive grep. Shortcut for grep(..., recursive=True)."""
    return grep(pattern, path, recursive=True, **kwargs)


def glob_files(pattern: str, path: str = ".") -> List[str]:
    """Find files matching a glob pattern."""
    root = Path(path).expanduser().resolve()
    return [str(p) for p in sorted(root.glob(pattern))]


# ============================================================================
# Find/Replace
# ============================================================================

def replace(path: str, old: str, new: str, count: int = -1) -> int:
    """Replace occurrences of a string in a file. Returns number of replacements."""
    p = Path(path).expanduser().resolve()
    content = p.read_text()
    if count < 0:
        new_content = content.replace(old, new)
        n = content.count(old)
    else:
        new_content = content.replace(old, new, count)
        n = min(content.count(old), count)
    p.write_text(new_content)
    _emit_status("replaced", path=str(p), count=n)
    return n


def sed(path: str, pattern: str, replacement: str, flags: int = 0) -> int:
    """Regex find/replace in a file. Returns number of replacements."""
    p = Path(path).expanduser().resolve()
    content = p.read_text()
    new_content, n = re.subn(pattern, replacement, content, flags=flags)
    p.write_text(new_content)
    _emit_status("sed", path=str(p), count=n)
    return n


def rsed(path: str, pattern: str, replacement: str, recursive: bool = True) -> int:
    """Recursive sed across files matching a glob or directory."""
    root = Path(path).expanduser().resolve()
    total = 0
    if root.is_file():
        total += sed(str(root), pattern, replacement)
    elif root.is_dir():
        for fp in root.rglob("*") if recursive else root.iterdir():
            if fp.is_file():
                try:
                    total += sed(str(fp), pattern, replacement)
                except (PermissionError, UnicodeDecodeError):
                    pass
    return total


# ============================================================================
# Line operations
# ============================================================================

def lines(path: str, start: int = 1, end: Optional[int] = None) -> str:
    """Read specific lines from a file (1-indexed, inclusive)."""
    p = Path(path).expanduser().resolve()
    all_lines = p.read_text().splitlines()
    s = max(0, start - 1)
    e = end if end else len(all_lines)
    return "\n".join(all_lines[s:e])


def delete_lines(path: str, start: int, end: int) -> None:
    """Delete lines from a file (1-indexed, inclusive)."""
    p = Path(path).expanduser().resolve()
    all_lines = p.read_text().splitlines()
    s = max(0, start - 1)
    del all_lines[s:end]
    p.write_text("\n".join(all_lines) + "\n")
    _emit_status("deleted_lines", path=str(p), start=start, end=end)


def delete_matching(path: str, pattern: str) -> int:
    """Delete all lines matching a regex pattern. Returns count deleted."""
    p = Path(path).expanduser().resolve()
    all_lines = p.read_text().splitlines()
    regex = re.compile(pattern)
    kept = [l for l in all_lines if not regex.search(l)]
    n = len(all_lines) - len(kept)
    p.write_text("\n".join(kept) + "\n")
    _emit_status("deleted_matching", path=str(p), count=n)
    return n


def insert_at(path: str, line_number: int, text: str) -> None:
    """Insert text at a specific line number (1-indexed)."""
    p = Path(path).expanduser().resolve()
    all_lines = p.read_text().splitlines()
    idx = max(0, line_number - 1)
    new_lines = text.splitlines()
    all_lines[idx:idx] = new_lines
    p.write_text("\n".join(all_lines) + "\n")
    _emit_status("inserted", path=str(p), line=line_number, count=len(new_lines))


# ============================================================================
# Shell
# ============================================================================

def run(cmd: str, cwd: Optional[str] = None, timeout: int = 30) -> dict:
    """Run a shell command and return stdout, stderr, returncode."""
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=timeout,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
    }


def env(key: Optional[str] = None) -> Union[str, dict, None]:
    """Get environment variable(s). Without args, returns all."""
    if key:
        return os.environ.get(key)
    return dict(os.environ)


# ============================================================================
# Text utilities
# ============================================================================

def sort_lines(text: str, reverse: bool = False, key=None) -> str:
    """Sort lines of text."""
    return "\n".join(sorted(text.splitlines(), reverse=reverse, key=key))


def uniq(text: str) -> str:
    """Remove duplicate lines (preserving order)."""
    seen = set()
    result = []
    for line in text.splitlines():
        if line not in seen:
            seen.add(line)
            result.append(line)
    return "\n".join(result)


def counter(items) -> List[tuple]:
    """Count occurrences. Returns list of (item, count) sorted by frequency."""
    return _Counter(items).most_common()


def cols(text: str, *indices: int, sep: Optional[str] = None) -> str:
    """Extract columns from text (0-indexed)."""
    result = []
    for line in text.splitlines():
        parts = line.split(sep)
        selected = [parts[i] for i in indices if i < len(parts)]
        result.append("\t".join(selected))
    return "\n".join(result)


# ============================================================================
# Navigation / info
# ============================================================================

def tree(
    path: str = ".",
    max_depth: int = 3,
    show_files: bool = True,
    pattern: Optional[str] = None,
) -> str:
    """Show directory tree structure."""
    root = Path(path).expanduser().resolve()
    lines_out = [str(root)]

    def _tree(p: Path, prefix: str, depth: int):
        if depth > max_depth:
            return
        try:
            entries = sorted(p.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
        except PermissionError:
            return

        dirs = [e for e in entries if e.is_dir() and not e.name.startswith(".")]
        files = [e for e in entries if e.is_file()] if show_files else []

        if pattern:
            files = [f for f in files if f.match(pattern)]

        items = dirs + files
        for i, item in enumerate(items):
            is_last = i == len(items) - 1
            connector = "└── " if is_last else "├── "
            lines_out.append(f"{prefix}{connector}{item.name}")
            if item.is_dir():
                extension = "    " if is_last else "│   "
                _tree(item, prefix + extension, depth + 1)

    _tree(root, "", 0)
    return "\n".join(lines_out)


def stat(path: str) -> dict:
    """Get file/directory metadata."""
    p = Path(path).expanduser().resolve()
    s = p.stat()
    return {
        "path": str(p),
        "name": p.name,
        "is_file": p.is_file(),
        "is_dir": p.is_dir(),
        "size": s.st_size,
        "modified": s.st_mtime,
        "created": s.st_ctime,
    }


def diff(path1: str, path2: str) -> str:
    """Show unified diff between two files."""
    import difflib
    p1 = Path(path1).expanduser().resolve()
    p2 = Path(path2).expanduser().resolve()
    lines1 = p1.read_text().splitlines(keepends=True)
    lines2 = p2.read_text().splitlines(keepends=True)
    return "".join(difflib.unified_diff(lines1, lines2, fromfile=str(p1), tofile=str(p2)))


# ============================================================================
# Prelude docs generator
# ============================================================================

def __gsd_prelude_docs__() -> str:
    """Generate documentation for all prelude helpers."""
    import inspect

    helpers = [
        # File I/O
        read, write, append,
        # File ops
        rm, mv, cp,
        # Search
        find, grep, rgrep, glob_files,
        # Find/Replace
        replace, sed, rsed,
        # Line ops
        lines, delete_lines, delete_matching, insert_at,
        # Shell
        run, env,
        # Text
        sort_lines, uniq, counter, cols,
        # Navigation
        tree, stat, diff,
    ]

    docs = []
    for fn in helpers:
        sig = inspect.signature(fn)
        doc = (fn.__doc__ or "").strip().split("\n")[0]
        docs.append(f"  {fn.__name__}{sig} — {doc}")

    return "Available helpers:\n" + "\n".join(docs)

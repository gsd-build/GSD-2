/**
 * browser-types.ts — Backend-agnostic browser interfaces.
 *
 * These interfaces define the contract between browser-tools and any
 * browser backend (Playwright, cmux, Puppeteer, etc.). They contain
 * ONLY the methods and properties that browser-tools actually uses.
 *
 * This replaces direct imports of Playwright's Page, Frame, Browser,
 * BrowserContext, Locator, Keyboard, and Mouse types in the
 * infrastructure layer (state.ts, lifecycle.ts, capture.ts, settle.ts,
 * refs.ts, utils.ts). Tool files never imported Playwright directly.
 */

// ─── Keyboard ────────────────────────────────────────────────────────────────

export interface BrowserKeyboard {
  press(key: string): Promise<void>;
  type(text: string): Promise<void>;
}

// ─── Mouse ───────────────────────────────────────────────────────────────────

export interface BrowserMouse {
  click(x: number, y: number): Promise<void>;
  wheel(deltaX: number, deltaY: number): Promise<void>;
}

// ─── Locator ─────────────────────────────────────────────────────────────────

export interface BrowserLocator {
  first(): BrowserLocator;
  click(options?: { timeout?: number }): Promise<void>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  evaluate<R, Arg = any>(fn: string | ((arg: Arg) => R), arg?: Arg): Promise<R>;
  setChecked(checked: boolean, options?: { timeout?: number }): Promise<void>;
  selectOption(value: string | string[] | { label?: string; value?: string; index?: number } | Array<{ label?: string; value?: string; index?: number }>, options?: { timeout?: number }): Promise<string[]>;
  hover(options?: { timeout?: number }): Promise<void>;
  focus(options?: { timeout?: number }): Promise<void>;
  isVisible(): Promise<boolean>;
  isChecked(): Promise<boolean>;
  setInputFiles(files: string | string[]): Promise<void>;
  pressSequentially(text: string, options?: { timeout?: number }): Promise<void>;
  textContent(): Promise<string | null>;
  inputValue(): Promise<string>;
  getAttribute(name: string): Promise<string | null>;
  innerHTML(): Promise<string>;
  count(): Promise<number>;
  ariaSnapshot(): Promise<string>;
  /** Capture a screenshot of this element. */
  screenshot(options?: { type?: string; quality?: number; path?: string; scale?: string }): Promise<Buffer>;
  /** Sub-locator scoping — find elements within this locator's scope. */
  locator(selector: string): BrowserLocator;
  /** Find by accessible label. */
  getByLabel(label: string | RegExp, options?: { exact?: boolean }): BrowserLocator;
}

// ─── BrowsingTarget (shared by Page and Frame) ──────────────────────────────

/**
 * The common surface that both pages and frames expose.
 * Most browser-tools operations work on a BrowsingTarget — they don't
 * care whether the target is the top-level page or an iframe.
 */
export interface BrowsingTarget {
  url(): string;
  /** Evaluate a function or expression in the browser context. */
  evaluate<R, Arg = any>(fn: string | ((arg: Arg) => R), arg?: Arg): Promise<R>;
  locator(selector: string): BrowserLocator;
  getByRole(role: string, options?: { name?: string | RegExp }): BrowserLocator;
  getByLabel(label: string | RegExp, options?: { exact?: boolean }): BrowserLocator;
  waitForFunction(fn: string | ((arg?: any) => boolean), arg?: any, options?: { timeout?: number; polling?: number | "raf" }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<void>;
  selectOption(selector: string, value: string | string[] | { label?: string; value?: string } | Array<{ label?: string; value?: string }>, options?: { timeout?: number }): Promise<string[]>;
  dragAndDrop(source: string, target: string, options?: { timeout?: number }): Promise<void>;
  content(): Promise<string>;
  /** Query selector shorthand — returns first match or null. */
  $(selector: string): Promise<any>;
}

// ─── BrowserFrame ────────────────────────────────────────────────────────────

export interface BrowserFrame extends BrowsingTarget {
  name(): string;
  parentFrame(): BrowserFrame | null;
  /** Capture a screenshot of this frame. */
  screenshot(options?: { type?: string; quality?: number; path?: string }): Promise<Buffer>;
}

// ─── BrowserPage ─────────────────────────────────────────────────────────────

export interface BrowserPage extends BrowsingTarget {
  // Navigation
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  goBack(options?: { waitUntil?: string; timeout?: number }): Promise<any>;
  goForward(options?: { waitUntil?: string; timeout?: number }): Promise<any>;
  reload(options?: { waitUntil?: string; timeout?: number }): Promise<void>;

  // State
  title(): Promise<string>;
  viewportSize(): { width: number; height: number } | null;
  setViewportSize(size: { width: number; height: number }): Promise<void>;

  // Capture
  screenshot(options?: {
    type?: string;
    quality?: number;
    path?: string;
    fullPage?: boolean;
    scale?: string;
    clip?: { x: number; y: number; width: number; height: number };
  }): Promise<Buffer>;
  pdf(options?: Record<string, unknown>): Promise<Buffer>;

  // Input devices
  keyboard: BrowserKeyboard;
  mouse: BrowserMouse;

  // Waiting
  waitForLoadState(state?: string, options?: { timeout?: number }): Promise<void>;
  waitForURL(url: string | RegExp | ((url: URL) => boolean), options?: { timeout?: number }): Promise<void>;
  waitForResponse(urlOrPredicate: string | RegExp | ((response: any) => boolean), options?: { timeout?: number }): Promise<any>;

  // Frames
  mainFrame(): BrowserFrame;
  frames(): BrowserFrame[];

  // Events
  on(event: string, handler: (...args: any[]) => void): void;

  // Lifecycle
  close(): Promise<void>;
  isClosed(): boolean;
  bringToFront(): Promise<void>;
  context(): BrowserSessionContext;

  // Network interception
  route(url: string | RegExp, handler: (route: any) => void): Promise<void>;
  unroute(url: string | RegExp, handler?: (route: any) => void): Promise<void>;
}

// ─── BrowserSessionContext ───────────────────────────────────────────────────

export interface BrowserSessionContext {
  addInitScript(script: string | { path: string }): Promise<void>;
  addCookies(cookies: Array<Record<string, unknown>>): Promise<void>;
  newPage(): Promise<BrowserPage>;
  on(event: string, handler: (...args: any[]) => void): void;
  close(): Promise<void>;
  storageState(options?: { path?: string }): Promise<any>;
  tracing: {
    start(options?: Record<string, unknown>): Promise<void>;
    stop(options?: { path?: string }): Promise<void>;
  };
}

// ─── BrowserEngine ───────────────────────────────────────────────────────────

export interface BrowserEngine {
  close(): Promise<void>;
  newContext(options?: Record<string, unknown>): Promise<BrowserSessionContext>;
}

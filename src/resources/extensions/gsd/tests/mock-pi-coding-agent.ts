import { readFileSync, writeFileSync } from 'node:fs';

export class AuthStorage {
  private filePath: string;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static create(filePath: string): AuthStorage {
    return new AuthStorage(filePath);
  }

  get(key: string): any {
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      return data[key];
    } catch {
      return undefined;
    }
  }

  set(key: string, value: any): void {
    let data: any = {};
    try {
      data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {}
    data[key] = value;
    writeFileSync(this.filePath, JSON.stringify(data));
  }

  remove(key: string): void {
    let data: any = {};
    try {
      data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {}
    delete data[key];
    writeFileSync(this.filePath, JSON.stringify(data));
  }
}

export function truncateHead(str: string, maxBytes: number, maxLines: number): string {
    return str.slice(0, maxBytes);
}
export const DEFAULT_MAX_BYTES = 5000;
export const DEFAULT_MAX_LINES = 100;
export function formatSize(bytes: number): string {
    return bytes + 'B';
}

export function getAgentDir(cwd: string): string {
  return `${cwd}/.gsd/agent`;
}

export function isToolCallEventType(type: string): boolean {
  return type === 'tool_call';
}

export function parseFrontmatter(content: string): { data: any, content: string } {
  return { data: {}, content };
}

export const createBashTool = () => ({});
export const createWriteTool = () => ({});
export const createReadTool = () => ({});
export const createEditTool = () => ({});

export function getMarkdownTheme() {
    return {};
}

export class DefaultResourceLoader {
  config: any;
  constructor(config: any) { this.config = config; }
  load() { return []; }
}

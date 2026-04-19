/**
 * Unit tests for remote-questions proxy resolution logic.
 *
 * These tests verify the resolveProxyUrl function directly without requiring
 * the full GSD runtime dependencies.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveProxyUrl } from "../config.js";

const PROXY_ENV_KEYS = [
  "TELEGRAM_PROXY_URL",
  "https_proxy",
  "HTTPS_PROXY",
  "http_proxy",
  "HTTP_PROXY",
  "all_proxy",
  "ALL_PROXY",
] as const;

const originalEnv: Record<string, string | undefined> = {};

describe("resolveProxyUrl", () => {
  beforeEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("returns undefined when no proxy is configured", () => {
    const result = resolveProxyUrl();
    assert.equal(result, undefined);
  });

  it("prefers TELEGRAM_PROXY_URL over config and standard env vars", () => {
    process.env.TELEGRAM_PROXY_URL = "http://telegram-proxy.example.com:8080";
    process.env.https_proxy = "http://https-proxy.example.com:9090";

    const result = resolveProxyUrl("http://config-proxy.example.com:7070");
    assert.equal(result, "http://telegram-proxy.example.com:8080");
  });

  it("falls back to config proxy_url when TELEGRAM_PROXY_URL is not set", () => {
    const result = resolveProxyUrl("http://config-proxy.example.com:7070");
    assert.equal(result, "http://config-proxy.example.com:7070");
  });

  it("falls back to https_proxy when no explicit proxy is set", () => {
    process.env.https_proxy = "http://https-proxy.example.com:9090";

    const result = resolveProxyUrl();
    assert.equal(result, "http://https-proxy.example.com:9090");
  });

  it("falls back to HTTPS_PROXY (uppercase) when https_proxy is not set", () => {
    process.env.HTTPS_PROXY = "http://HTTPS-PROXY.example.com:9090";

    const result = resolveProxyUrl();
    assert.equal(result, "http://HTTPS-PROXY.example.com:9090");
  });

  it("falls back to http_proxy when no https proxy is set", () => {
    process.env.http_proxy = "http://http-proxy.example.com:8080";

    const result = resolveProxyUrl();
    assert.equal(result, "http://http-proxy.example.com:8080");
  });

  it("falls back to HTTP_PROXY (uppercase) when http_proxy is not set", () => {
    process.env.HTTP_PROXY = "http://HTTP-PROXY.example.com:8080";

    const result = resolveProxyUrl();
    assert.equal(result, "http://HTTP-PROXY.example.com:8080");
  });

  it("falls back to all_proxy when no http/https proxy is set", () => {
    process.env.all_proxy = "socks5://all-proxy.example.com:1080";

    const result = resolveProxyUrl();
    assert.equal(result, "socks5://all-proxy.example.com:1080");
  });

  it("falls back to ALL_PROXY (uppercase) when all_proxy is not set", () => {
    process.env.ALL_PROXY = "socks5://ALL-PROXY.example.com:1080";

    const result = resolveProxyUrl();
    assert.equal(result, "socks5://ALL-PROXY.example.com:1080");
  });

  it("prefers https_proxy over http_proxy and all_proxy", () => {
    process.env.https_proxy = "http://https.example.com:9090";
    process.env.http_proxy = "http://http.example.com:8080";
    process.env.all_proxy = "socks5://all.example.com:1080";

    const result = resolveProxyUrl();
    assert.equal(result, "http://https.example.com:9090");
  });

  it("prefers http_proxy over all_proxy", () => {
    process.env.http_proxy = "http://http.example.com:8080";
    process.env.all_proxy = "socks5://all.example.com:1080";

    const result = resolveProxyUrl();
    assert.equal(result, "http://http.example.com:8080");
  });
});

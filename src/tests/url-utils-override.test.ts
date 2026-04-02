import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isBlockedUrl, setFetchAllowedUrls, getFetchAllowedUrls } from "../resources/extensions/search-the-web/url-utils.ts";

describe("setFetchAllowedUrls — user override", () => {
  afterEach(() => {
    // Reset to empty allowlist after each test
    setFetchAllowedUrls([]);
  });

  it("defaults to empty allowlist", () => {
    assert.deepEqual(getFetchAllowedUrls(), []);
  });

  it("exempts an allowed hostname from blocking", () => {
    assert.equal(isBlockedUrl("http://192.168.1.100/docs"), true, "blocked by default");
    setFetchAllowedUrls(["192.168.1.100"]);
    assert.equal(isBlockedUrl("http://192.168.1.100/docs"), false, "allowed after override");
  });

  it("exempts localhost when explicitly allowed", () => {
    assert.equal(isBlockedUrl("http://localhost:3000/api"), true, "blocked by default");
    setFetchAllowedUrls(["localhost"]);
    assert.equal(isBlockedUrl("http://localhost:3000/api"), false, "allowed after override");
  });

  it("exempts cloud metadata hostname when allowed", () => {
    assert.equal(isBlockedUrl("http://metadata.google.internal/computeMetadata/"), true, "blocked by default");
    setFetchAllowedUrls(["metadata.google.internal"]);
    assert.equal(isBlockedUrl("http://metadata.google.internal/computeMetadata/"), false, "allowed after override");
  });

  it("does not affect URLs not in the allowlist", () => {
    setFetchAllowedUrls(["192.168.1.100"]);
    assert.equal(isBlockedUrl("http://192.168.1.200/secret"), true, "other private IPs still blocked");
    assert.equal(isBlockedUrl("http://localhost/admin"), true, "localhost still blocked");
  });

  it("still allows public URLs without configuration", () => {
    setFetchAllowedUrls(["192.168.1.100"]);
    assert.equal(isBlockedUrl("https://example.com"), false);
  });

  it("still blocks non-HTTP protocols even with allowlist", () => {
    setFetchAllowedUrls(["localhost"]);
    assert.equal(isBlockedUrl("file:///etc/passwd"), true, "file:// still blocked");
    assert.equal(isBlockedUrl("ftp://localhost/data"), true, "ftp:// still blocked");
  });

  it("is case-insensitive for hostnames", () => {
    setFetchAllowedUrls(["MyHost.Internal"]);
    assert.equal(isBlockedUrl("http://myhost.internal/api"), false);
  });
});

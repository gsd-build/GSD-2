import { describe, it, expect } from "bun:test";
import { detectBoundaryViolation } from "../src/server/boundary-enforcer";

describe("detectBoundaryViolation", () => {
  const projectRoot = "/home/user/myproject";
  const winRoot = "C:/Users/user/myproject";

  it("returns violated=true for a Unix path outside the project root", () => {
    const result = detectBoundaryViolation("writing to /tmp/outside.txt", projectRoot);
    expect(result.violated).toBe(true);
    expect(result.path).toBe("/tmp/outside.txt");
  });

  it("returns violated=false for a Unix path inside the project root", () => {
    const result = detectBoundaryViolation(
      "writing to /home/user/myproject/src/foo.ts",
      projectRoot
    );
    expect(result.violated).toBe(false);
  });

  it("returns violated=false when text has no absolute paths", () => {
    const result = detectBoundaryViolation("no paths here just text", projectRoot);
    expect(result.violated).toBe(false);
  });

  it("returns violated=true for a Windows path outside the project root", () => {
    const result = detectBoundaryViolation(
      "writing to C:\\Users\\other\\project\\file.ts",
      winRoot
    );
    expect(result.violated).toBe(true);
    expect(result.path).toMatch(/other/);
  });

  it("returns violated=false for a Windows path inside the project root", () => {
    const result = detectBoundaryViolation(
      "writing to C:/Users/user/myproject/src/index.ts",
      winRoot
    );
    expect(result.violated).toBe(false);
  });

  it("does not flag relative paths", () => {
    const result = detectBoundaryViolation("editing ./src/foo.ts", projectRoot);
    expect(result.violated).toBe(false);
  });

  it("does not flag trivially short paths like /", () => {
    const result = detectBoundaryViolation("root is /", projectRoot);
    expect(result.violated).toBe(false);
  });
});

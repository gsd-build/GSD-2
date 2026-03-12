// @ts-ignore — ErrorBoundary not yet created; test will fail with import error until Plan 03
/**
 * SC-6: ErrorBoundary renders fallback when a child component throws during render.
 *
 * RED state: This test will fail with "Cannot find module" until Plan 03 creates
 * src/components/ErrorBoundary.tsx.
 *
 * Pattern: Uses renderToString from react-dom/server to exercise the class component
 * error boundary lifecycle (getDerivedStateFromError / componentDidCatch).
 */
import { describe, it, expect } from "bun:test";
// @ts-ignore — ErrorBoundary not yet created; test will fail with import error until Plan 03
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

/**
 * A component that always throws during render — used to trigger ErrorBoundary.
 * Note: renderToString propagates render errors synchronously in React 19.
 */
function ThrowingChild(): never {
  throw new Error("ThrowingChild: intentional render error for ErrorBoundary test");
}

describe("SC-6: ErrorBoundary fallback on render error", () => {
  it("renders fallback when a child component throws during render", () => {
    // This test FAILS until Plan 03 creates src/components/ErrorBoundary.tsx.
    // The import above will throw "Cannot find module" until the file exists.

    const fallback = createElement("p", null, "Error occurred");
    const tree = createElement(
      ErrorBoundary,
      { fallback },
      createElement(ThrowingChild, null)
    );

    // renderToString will exercise the error boundary lifecycle.
    // After the ErrorBoundary catches the error, it should render the fallback.
    let output: string;
    try {
      output = renderToString(tree);
    } catch {
      // If ErrorBoundary doesn't exist or doesn't catch — test fails with throw
      throw new Error(
        "ErrorBoundary did not catch the render error — " +
        "either ErrorBoundary.tsx does not exist or does not implement error catching"
      );
    }

    // Assert: fallback text is present in the rendered output
    expect(output).toContain("Error occurred");

    // Assert: the throwing child's error is NOT in the output
    expect(output).not.toContain("ThrowingChild");
  });

  it("ErrorBoundary can be instantiated as a React element", () => {
    // Minimal smoke test: verify ErrorBoundary is importable and is a valid component.
    // This also fails until Plan 03 creates the file.
    expect(ErrorBoundary).toBeDefined();
    expect(typeof ErrorBoundary).toBe("function");
  });
});

import { delimiter } from "node:path";

export function parseBundledExtensionPaths(
	value: string | undefined,
	pathDelimiter = delimiter,
): string[] {
	return (value ?? "")
		.split(pathDelimiter)
		.map((segment) => segment.trim())
		.filter(Boolean);
}

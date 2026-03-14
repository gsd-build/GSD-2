import { delimiter } from "node:path";

export function serializeBundledExtensionPaths(
	paths: readonly string[],
	pathDelimiter = delimiter,
): string {
	return paths.filter(Boolean).join(pathDelimiter);
}

export function parseBundledExtensionPaths(
	value: string | undefined,
	pathDelimiter = delimiter,
): string[] {
	return (value ?? "")
		.split(pathDelimiter)
		.map((segment) => segment.trim())
		.filter(Boolean);
}

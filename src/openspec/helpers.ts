/** Narrow parsed CLI JSON to a non-array object suitable for field inspection. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Convert an unknown caught value into a stable message suitable for a tool result. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

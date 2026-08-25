/** Stable error codes used by the OpenSpec integration. */
export type OpenSpecErrorCode =
    | "OPENSPEC_UNAVAILABLE"
    | "OPENSPEC_INCOMPATIBLE"
    | "OPENSPEC_MALFORMED_RESPONSE"
    | "OPENSPEC_OUTPUT_PATH_INVALID"
    | "OPENSPEC_PLANNING_INCOMPLETE"
    | "OPENSPEC_VALIDATION_FAILED";

/**
 * Format actionable repair guidance for an OpenSpec integration failure.
 *
 * The first line is intentionally stable and specific so callers can surface
 * it directly, while the numbered block gives users a concrete next action.
 */
export function formatRemediation(
    code: OpenSpecErrorCode,
    details: Record<string, string>,
): string {
    const wrapper = details.wrapper ?? "OpenSpec";
    const field = details.field ?? "response";
    const observed = details.observed ?? "unknown";
    const expected = details.expected ?? "the declared contract";
    const change = details.change ?? "<change>";
    const path = details.path ?? "<path>";
    const issues = details.issues ?? "the listed violations";
    const missingCapabilities = details.missingCapabilities ?? "the missing capabilities";
    const installedVersion = details.installedVersion ?? "unknown";
    const targetVersion = details.targetVersion ?? "the target version";
    void targetVersion;

    switch (code) {
        case "OPENSPEC_UNAVAILABLE":
            return [
                `${code}: ${wrapper} is unavailable`,
                "Fix:",
                "  1. Install OpenSpec: npm install -g @fission-ai/openspec",
                "  2. Re-run specops_doctor.",
            ].join("\n");
        case "OPENSPEC_INCOMPATIBLE":
            return [
                `${code}: OpenSpec ${installedVersion} is missing required capability: ${missingCapabilities}`,
                "Fix:",
                "  1. Install or upgrade to the latest OpenSpec: bun install -g @fission-ai/openspec@latest",
                `  2. Alternatively, ensure your OpenSpec install exposes the failing capability (${missingCapabilities}).`,
                "  3. Re-run specops_doctor.",
            ].join("\n");
        case "OPENSPEC_MALFORMED_RESPONSE":
            return [
                `${code}: ${wrapper} field \"${field}\" provided ${observed}; expected ${expected}`,
                "Fix:",
                `  1. Check the OpenSpec install and the ${wrapper} response contract; the install may be mismatched (see openspec-compatibility).`,
                "  2. Report the response shape to SpecOps, or update the supported contract if newer fields should be consumed.",
            ].join("\n");
        case "OPENSPEC_OUTPUT_PATH_INVALID":
            return [
                `${code}: ${wrapper} returned unusable output path \"${path}\"`,
                "Fix:",
                `  1. Run \`openspec instructions ${details.id ?? "<id>"} --change ${change}\` manually to regenerate the instructions, then retry.`,
            ].join("\n");
        case "OPENSPEC_PLANNING_INCOMPLETE":
            return [
                `${code}: ${change} has no requirement deltas yet`,
                "This is expected while first-pass planning artifacts are still being authored, not a validation failure.",
                "Fix:",
                `  1. Continue planning: author the remaining proposal and capability specifications for ${change}.`,
                `  2. Re-run \`openspec validate ${change} --strict\` once the capability specifications exist.`,
            ].join("\n");
        case "OPENSPEC_VALIDATION_FAILED":
            return [
                `${code}: validation failed for ${change}: ${issues}`,
                "Fix:",
                `  1. Run \`openspec validate ${change} --strict\` and fix the listed violations (${issues}), then retry.`,
            ].join("\n");
    }
}

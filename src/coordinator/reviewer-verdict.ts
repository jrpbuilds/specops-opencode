/**
 * Parse the reviewer's terminal verdict from a dispatch result.
 *
 * The reviewer contract (prompts/reviewer.md) requires exactly one
 * unambiguous outcome line — `PASS` or `FAIL` — as the first line of the
 * final message, with the compliance matrix and findings following. This
 * module projects that observed contract onto a stable verdict value; it
 * never judges review content and never feeds workflow routing. Anything
 * the contract does not pin down — a frontier-blocker return, an error
 * envelope, prose before the outcome, or a missing result — is unresolved:
 * the parser reports `undefined` and callers must leave observed state
 * unchanged.
 *
 * Foreground task results carry the specialist's raw final message.
 * Background dispatch-time envelopes arrive wrapped in a `<task …>` tag, so
 * a leading tag is stripped before matching; the tag itself is never
 * treated as the verdict.
 *
 * Exports: `ReviewerVerdict`, `parseReviewerVerdict`.
 */

/** The reviewer outcomes the runtime can observe from a completed result. */
export type ReviewerVerdict = "pass" | "fail";

/**
 * Extract the reviewer's terminal verdict from one task result.
 *
 * Strict by contract: the first non-empty line must be exactly `PASS` or
 * `FAIL`. A leading background `<task …>` envelope is tolerated and never
 * read as the verdict. Returns `undefined` for anything unresolved —
 * malformed output, a frontier-eligible blocker, or an error result — so
 * observers can fail open without inventing review state.
 *
 * @param output The raw task-tool result text, when available.
 * @returns The observed verdict, or `undefined` when it cannot be read.
 */
export function parseReviewerVerdict(output: string | undefined): ReviewerVerdict | undefined {
    if (!output) return undefined;
    let text = output;
    const envelope = /^<task\b[^>]*>/.exec(text);
    if (envelope) text = text.slice(envelope[0].length);
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "PASS") return "pass";
        if (trimmed === "FAIL") return "fail";
        return undefined;
    }
    return undefined;
}

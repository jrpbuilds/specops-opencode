/**
 * Parse the dispatch envelope's `changeName` identity line from one
 * specialist dispatch prompt.
 *
 * The envelope is the current-job payload the coordinator sends with every
 * specialist Task dispatch; the change name is its one machine-checked field,
 * validated against the session binding at the dispatch boundary
 * (`src/host/dispatch-gate.ts`) so a stale or misrouted dispatch fails before
 * the specialist starts. Everything else in the envelope is coordinator-
 * authored prose pasted from canonical tool output and is deliberately not
 * parsed here — the boundary validates identity, it never authors payloads.
 *
 * Detection is line-anchored and parse is line-strict, mirroring
 * `parseAssignedTaskIds` (`./implementer-progress.ts`): dispatch prompts
 * legitimately quote field names in ordinary prose — task descriptions
 * regularly name `changeName` itself — so a mid-line mention must stay
 * invisible to the parser. A line that starts with the token but does not
 * match the canonical shape is reported as malformed rather than absent, so
 * an off-contract identity line is rejected instead of silently read as a
 * missing one. The canonical form is exactly one line (after trimming the
 * line's own leading/trailing whitespace) reading `changeName: <change>`;
 * change names are single tokens and carry no internal whitespace.
 */

/** Detection and parse result for one dispatch prompt's identity line. */
export type ChangeNameParse =
    | { readonly status: "absent" }
    | { readonly status: "present"; readonly change: string }
    | { readonly status: "malformed"; readonly reason: string };

/** The identity token, detected at the start of a trimmed prompt line. */
const CHANGE_NAME_LINE_START = /^changeName\b/;

/** The canonical line shape, matched against already-trimmed lines. */
// Keep both patterns free of overlapping quantifiers so uncontrolled prompts
// cannot trigger polynomial backtracking in the regex engine.
const CHANGE_NAME_LINE = /^changeName:(.+)$/;

/**
 * Read the coordinator's `changeName` line from one dispatch prompt.
 *
 * @param prompt The raw Task prompt sent to a specialist, if any.
 * @returns `absent` when no line starts with the token, `malformed` when the
 *     token appears but no single canonical line carries it, and `present`
 *     with the named change otherwise.
 */
export function parseChangeName(prompt: string | undefined): ChangeNameParse {
    if (typeof prompt !== "string" || !prompt) return { status: "absent" };
    const lines = prompt.split(/\r?\n/).map(line => line.trim());
    if (!lines.some(line => CHANGE_NAME_LINE_START.test(line))) return { status: "absent" };

    const canonical = lines.filter(line => CHANGE_NAME_LINE.test(line));
    if (canonical.length === 0) {
        return {
            status: "malformed",
            reason: "changeName appears but no line matches 'changeName: <change>'",
        };
    }
    if (canonical.length > 1) {
        return { status: "malformed", reason: "multiple canonical changeName lines" };
    }

    const change = canonical[0].slice("changeName:".length).trim();
    if (!change) return { status: "malformed", reason: "empty change name" };
    if (/\s/.test(change)) {
        return { status: "malformed", reason: `change name '${change}' contains whitespace` };
    }
    return { status: "present", change };
}

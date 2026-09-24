/**
 * Model-supplied review lane definitions and their dispatch identity envelope.
 *
 * This module validates syntax only. It deliberately does not decide whether
 * lanes should exist, whether scopes are independent, or which lens a scope
 * deserves.
 */

/** The stable conceptual review lenses supported by SpecOps. */
export const REVIEW_LENSES = ["correctness", "risk", "quality"] as const;

export type ReviewLens = (typeof REVIEW_LENSES)[number];

/** Canonical critic identities correspond to the supported review lenses. */
export type ReviewCriticId = ReviewLens;
export const REVIEW_CRITIC_IDS: readonly ReviewCriticId[] = REVIEW_LENSES;

/** One independent review job selected by the Orchestrator. */
export type ReviewLaneDefinition = {
    readonly id: string;
    readonly lens: ReviewLens;
    readonly scope: string;
    readonly capabilityHints?: readonly string[];
};

/** Runtime-owned execution state for one registered lane. */
export type ReviewLaneExecutionState = "pending" | "inFlight" | "completed" | "failed";

/** One lane definition with its runtime-observed execution state. */
export type ReviewLaneProgress = ReviewLaneDefinition & {
    readonly state: ReviewLaneExecutionState;
    readonly attempts: number;
};

/** Runtime snapshot of one ephemeral review round. */
export type ReviewLaneRoundSnapshot = {
    readonly active: true;
    readonly roundId: string;
    readonly change: string;
    readonly lanes: readonly ReviewLaneProgress[];
    readonly counts: {
        readonly pending: number;
        readonly inFlight: number;
        readonly completed: number;
        readonly failed: number;
    };
    readonly fanInComplete: boolean;
};

/** Presentation-only summary of the observed lanes in one active round. */
export type ReviewLanesProgress = {
    readonly roundId: string;
    readonly lanes: readonly Pick<
        ReviewLaneProgress,
        "id" | "lens" | "scope" | "state" | "attempts"
    >[];
    readonly counts: ReviewLaneRoundSnapshot["counts"];
    readonly fanInComplete: boolean;
};

export type ReviewLanesSummaryResult =
    | { readonly ok: true; readonly progress: ReviewLanesProgress }
    | { readonly ok: false; readonly error: string };

export type ReviewLaneValidationResult =
    | { readonly ok: true; readonly lanes: readonly ReviewLaneDefinition[] }
    | { readonly ok: false; readonly error: string };

export type ReviewLaneDispatchIdentity = {
    readonly roundId: string;
    readonly laneId: string;
    readonly scope: string;
};

export type ReviewLaneDispatchParseResult =
    | { readonly ok: true; readonly identity: ReviewLaneDispatchIdentity }
    | { readonly ok: false; readonly error: string };

/** Token characters accepted for generated round IDs and model-supplied lane IDs. */
const LANE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Validate and order one runtime snapshot for read-only Todo and diagnostic views.
 *
 * The host owns execution state; this function only checks its detached snapshot
 * and never feeds a projection back into dispatch or workflow decisions. Lanes
 * are grouped by lens while preserving registration order within each lens.
 *
 * @param snapshot Runtime-observed round snapshot.
 * @returns Canonical progress or a deterministic presentation error.
 */
export function summarizeReviewLanes(snapshot: ReviewLaneRoundSnapshot): ReviewLanesSummaryResult {
    if (
        !isRecord(snapshot) ||
        snapshot.active !== true ||
        typeof snapshot.roundId !== "string" ||
        !LANE_ID_PATTERN.test(snapshot.roundId) ||
        typeof snapshot.change !== "string" ||
        !snapshot.change.trim() ||
        !Array.isArray(snapshot.lanes) ||
        snapshot.lanes.length === 0
    ) {
        return { ok: false, error: "review round has invalid identity or lanes" };
    }

    const definitions = snapshot.lanes.map(lane =>
        isRecord(lane)
            ? {
                  id: lane.id,
                  lens: lane.lens,
                  scope: lane.scope,
                  capabilityHints: lane.capabilityHints,
              }
            : lane,
    );
    const validated = validateReviewLanes(definitions);
    if (!validated.ok) return { ok: false, error: validated.error };

    const counts = { pending: 0, inFlight: 0, completed: 0, failed: 0 };
    const lanes: ReviewLanesProgress["lanes"][number][] = [];
    for (let index = 0; index < snapshot.lanes.length; index++) {
        const lane = snapshot.lanes[index];
        if (
            !isRecord(lane) ||
            !["pending", "inFlight", "completed", "failed"].includes(String(lane.state)) ||
            !Number.isInteger(lane.attempts) ||
            (lane.attempts as number) < (lane.state === "pending" ? 0 : 1)
        ) {
            return {
                ok: false,
                error: `review lane '${validated.lanes[index].id}' has invalid execution state`,
            };
        }
        const state = lane.state as ReviewLaneExecutionState;
        counts[state]++;
        const { id, lens, scope } = validated.lanes[index];
        lanes.push({ id, lens, scope, state, attempts: lane.attempts as number });
    }

    if (
        !isRecord(snapshot.counts) ||
        (Object.keys(counts) as (keyof typeof counts)[]).some(
            state => snapshot.counts[state] !== counts[state],
        )
    ) {
        return { ok: false, error: "review lane counts do not match execution states" };
    }
    const fanInComplete = counts.completed === lanes.length;
    if (snapshot.fanInComplete !== fanInComplete) {
        return { ok: false, error: "review lane fan-in does not match execution states" };
    }

    const ordered = REVIEW_LENSES.flatMap(lens => lanes.filter(lane => lane.lens === lens));
    return {
        ok: true,
        progress: { roundId: snapshot.roundId, lanes: ordered, counts, fanInComplete },
    };
}

/**
 * Validate an Orchestrator-supplied lane plan without selecting or reordering
 * its lanes. Successful definitions are normalized by trimming scopes and
 * hints while preserving the model's lane order.
 *
 * @param input Untrusted value supplied as the proposed lane plan.
 * @returns Validated, normalized lane definitions, or a deterministic error.
 */
export function validateReviewLanes(input: unknown): ReviewLaneValidationResult {
    if (!Array.isArray(input) || input.length === 0) {
        return { ok: false, error: "review lanes must be a non-empty array" };
    }

    const lanes: ReviewLaneDefinition[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < input.length; index++) {
        const lane = input[index] as unknown;
        if (!isRecord(lane)) {
            return { ok: false, error: `review lane #${index + 1} must be an object` };
        }

        const unknownKeys = Object.keys(lane).filter(
            key => !["id", "lens", "scope", "capabilityHints"].includes(key),
        );
        if (unknownKeys.length > 0) {
            return {
                ok: false,
                error: `review lane #${index + 1} has unsupported field(s): ${unknownKeys.join(", ")}`,
            };
        }

        if (typeof lane.id !== "string" || !LANE_ID_PATTERN.test(lane.id)) {
            return {
                ok: false,
                error: `review lane #${index + 1} has an invalid id; use a non-empty token containing only letters, numbers, '.', '_' or '-'`,
            };
        }
        if (seen.has(lane.id)) {
            return { ok: false, error: `duplicate review lane id '${lane.id}'` };
        }
        seen.add(lane.id);

        if (!isReviewLens(lane.lens)) {
            return {
                ok: false,
                error: `review lane '${lane.id}' has an unsupported lens; expected correctness, risk, or quality`,
            };
        }
        if (typeof lane.scope !== "string" || !lane.scope.trim() || /[\r\n]/.test(lane.scope)) {
            return {
                ok: false,
                error: `review lane '${lane.id}' must have a non-empty, single-line scope`,
            };
        }

        let capabilityHints: readonly string[] | undefined;
        if (lane.capabilityHints !== undefined) {
            if (
                !Array.isArray(lane.capabilityHints) ||
                !lane.capabilityHints.every(
                    hint =>
                        typeof hint === "string" && Boolean(hint.trim()) && !/[\r\n]/.test(hint),
                )
            ) {
                return {
                    ok: false,
                    error: `review lane '${lane.id}' capabilityHints must be an array of non-empty, single-line strings`,
                };
            }
            capabilityHints = lane.capabilityHints.map((hint: string) => hint.trim());
        }

        lanes.push({
            id: lane.id,
            lens: lane.lens,
            scope: lane.scope.trim(),
            ...(capabilityHints === undefined ? {} : { capabilityHints }),
        });
    }

    return { ok: true, lanes };
}

/**
 * Parse the required review identity fields from one critic Task prompt.
 * Each of `reviewRoundId`, `reviewLaneId`, and `reviewScope` must occur once;
 * round and lane IDs must use the supported token syntax, and scope must be
 * non-empty and single-line.
 *
 * @param prompt Critic Task prompt, or `undefined` when no prompt was supplied.
 * @returns Parsed identity fields, or a deterministic validation error.
 */
export function parseReviewLaneDispatch(prompt: string | undefined): ReviewLaneDispatchParseResult {
    if (typeof prompt !== "string") {
        return { ok: false, error: "the critic dispatch is missing its review-lane identity" };
    }

    const roundId = readDispatchLine(prompt, "reviewRoundId");
    if (!roundId.ok) return roundId;
    const laneId = readDispatchLine(prompt, "reviewLaneId");
    if (!laneId.ok) return laneId;
    const scope = readDispatchLine(prompt, "reviewScope");
    if (!scope.ok) return scope;

    if (!LANE_ID_PATTERN.test(roundId.value)) {
        return { ok: false, error: "reviewRoundId must be a non-empty identity token" };
    }
    if (!LANE_ID_PATTERN.test(laneId.value)) {
        return { ok: false, error: "reviewLaneId must be a non-empty identity token" };
    }

    return {
        ok: true,
        identity: { roundId: roundId.value, laneId: laneId.value, scope: scope.value },
    };
}

/**
 * Parse the optional active-round token passed to the Final Reviewer.
 * An absent prompt or round line represents direct review; duplicate or
 * malformed round lines are rejected.
 *
 * @param prompt Final Reviewer Task prompt, or `undefined` when not supplied.
 * @returns The optional round ID, or a deterministic validation error.
 */
export function parseReviewRoundIdentity(
    prompt: string | undefined,
):
    | { readonly ok: true; readonly roundId: string | undefined }
    | { readonly ok: false; readonly error: string } {
    if (typeof prompt !== "string") return { ok: true, roundId: undefined };
    const line = findDispatchLines(prompt, "reviewRoundId");
    if (line.length === 0) return { ok: true, roundId: undefined };
    if (line.length !== 1) {
        return { ok: false, error: "reviewRoundId must appear exactly once" };
    }
    const roundId = line[0].slice("reviewRoundId:".length).trim();
    if (!LANE_ID_PATTERN.test(roundId)) {
        return { ok: false, error: "reviewRoundId must be a non-empty identity token" };
    }
    return { ok: true, roundId };
}

/**
 * Read one named dispatch field that must occur exactly once and have a value.
 *
 * @param prompt Task prompt containing the dispatch metadata.
 * @param field Exact field name to locate before its colon.
 * @returns The trimmed field value, or a deterministic validation error.
 */
function readDispatchLine(
    prompt: string,
    field: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
    const lines = findDispatchLines(prompt, field);
    if (lines.length !== 1) {
        return {
            ok: false,
            error: `${field} must appear exactly once in the critic dispatch`,
        };
    }
    const value = lines[0].slice(`${field}:`.length).trim();
    if (!value || /[\r\n]/.test(value)) {
        return { ok: false, error: `${field} must have a non-empty single-line value` };
    }
    return { ok: true, value };
}

/**
 * Collect prompt lines that begin with the exact named dispatch-field prefix.
 *
 * @param prompt Task prompt to inspect.
 * @param field Dispatch field name followed by a colon.
 * @returns Matching lines in their original order.
 */
function findDispatchLines(prompt: string, field: string): string[] {
    return prompt.split(/\r?\n/).filter(line => line.startsWith(`${field}:`));
}

/**
 * Check whether an unknown value is one of the supported review lenses.
 *
 * @param value Value to narrow.
 * @returns `true` when the value is a canonical review lens.
 */
function isReviewLens(value: unknown): value is ReviewLens {
    return typeof value === "string" && (REVIEW_LENSES as readonly string[]).includes(value);
}

/**
 * Check whether a value is a non-null, non-array object suitable for field access.
 *
 * @param value Value to narrow.
 * @returns `true` for object values other than `null` and arrays.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CaptureStdout } from "../openspec/helpers.js";

/**
 * Content fingerprint of the protected state captured at the review window
 * boundary. `tracked` covers git-tracked repository files and `openspec` the
 * git-ignored OpenSpec tree; both are maps of repo-root-relative POSIX path to
 * SHA-256 hex digest.
 */
export type Baseline = {
    version: 1;
    change: string;
    root: string;
    capturedAt: string;
    tracked: Record<string, string>;
    openspec: Record<string, string>;
};

/** One protected-path delta detected against the baseline. */
export type GuardViolation = {
    path: string;
    kind: "modified" | "added" | "removed";
    scope: "tracked" | "openspec";
    baselineHash?: string;
    currentHash?: string;
};

/** Outcome of one verification pass against a captured baseline. */
export type GuardResult = {
    mutated: boolean;
    violations: GuardViolation[];
    /** True when no usable baseline exists, so the caller must fail closed. */
    missingBaseline?: boolean;
};

/** Injected command runner keeping the module host-free and testable. */
export type ReviewGuardDeps = {
    capture: CaptureStdout;
};

/** Current protected-state maps used for diffing against a baseline. */
export type CurrentState = {
    tracked: Record<string, string>;
    openspec: Record<string, string>;
};

/** Result of a baseline capture, mirroring the tool's JSON envelope. */
export type CaptureResult = {
    operation: "capture";
    change: string;
    root: string;
    trackedCount: number;
    openspecCount: number;
};

/**
 * Whether a repo-relative path is outside the protected set.
 *
 * Verification artifacts (any path component named `node_modules`, `dist`, or
 * `coverage`, and any `.log` file) are excluded so running tests, builds,
 * linters, and typechecks during review never produces a false positive. The
 * guard's own baseline store is excluded so a reviewer staging or rewriting it
 * cannot trip the detector or cover its tracks.
 */
export function isIgnored(relPath: string): boolean {
    const components = relPath.split(/[\\/]+/).filter(Boolean);
    if (components.length === 0) return false;
    if (components[0] === ".specops-review-guard") return true;
    const basename = components[components.length - 1];
    if (basename.endsWith(".log")) return true;
    return components.some(
        component =>
            component === "node_modules" || component === "dist" || component === "coverage",
    );
}

/**
 * Hash a file's contents with SHA-256.
 *
 * Empty files hash to the digest of the empty string. Symlinks are read
 * through (`readFile` follows the link), so a changed link target changes the
 * hash. Unreadable paths reject, which callers treat as absent from the
 * current protected state.
 */
export async function hashFile(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
}

/**
 * Enumerate git-tracked files from the repo root and hash each one.
 *
 * The tracked set comes from `git ls-files` run through the injected capture,
 * filtered by {@link isIgnored}. A path that cannot be read (for example a
 * tracked file deleted from the worktree without `git rm`) is omitted from the
 * map, so the baseline diff reports it as `removed` rather than silently
 * passing a deleted protected file.
 */
export async function enumerateTracked(
    root: string,
    capture: CaptureStdout,
): Promise<Record<string, string>> {
    const result = await capture("git", ["ls-files"], root);
    if (result.exitCode !== 0) return {};
    const tracked: Record<string, string> = {};
    for (const relPath of result.stdout
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)) {
        if (isIgnored(relPath)) continue;
        try {
            tracked[relPath] = await hashFile(path.join(root, relPath));
        } catch {
            // Unreadable now; treat as absent from the current protected state.
        }
    }
    return tracked;
}

/**
 * Recursively walk the git-ignored `openspec/` tree and hash every file.
 *
 * Symlinked directories are skipped (avoids cycles) while symlinked files are
 * read through so a changed link target changes the hash. Paths matching
 * {@link isIgnored} are excluded; unreadable files are omitted so a file
 * deleted during the review window is diffed as `removed`.
 */
export async function enumerateOpenSpec(root: string): Promise<Record<string, string>> {
    const openspec: Record<string, string> = {};
    await walkTree(path.join(root, "openspec"), root, openspec);
    return openspec;
}

async function walkTree(dir: string, root: string, out: Record<string, string>): Promise<void> {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return; // `openspec/` absent → nothing protected under this scope
    }
    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        const relPath = toPosixPath(path.relative(root, absolute));
        if (isIgnored(relPath)) continue;

        if (entry.isDirectory()) {
            await walkTree(absolute, root, out);
        } else if (entry.isSymbolicLink()) {
            const linked = await stat(absolute).catch(() => undefined);
            if (!linked || linked.isDirectory()) continue; // skip symlinked directories
            try {
                out[relPath] = await hashFile(absolute);
            } catch {
                // Unreadable; treat as absent from the current protected state.
            }
        } else if (entry.isFile()) {
            try {
                out[relPath] = await hashFile(absolute);
            } catch {
                // Unreadable; treat as absent from the current protected state.
            }
        }
    }
}

/** Normalize a platform-relative path to POSIX separators for map keys. */
function toPosixPath(relPath: string): string {
    return relPath.split(/[\\/]+/).join("/");
}

/**
 * Resolve the repository root from a working directory.
 *
 * Runs `git rev-parse --show-toplevel` through the injected capture and falls
 * back to the given directory when git fails or reports nothing, so the guard
 * still protects the OpenSpec walk in non-git worktrees.
 */
export async function resolveRepoRoot(cwd: string, capture: CaptureStdout): Promise<string> {
    try {
        const result = await capture("git", ["rev-parse", "--show-toplevel"], cwd);
        const root = result.stdout.trim();
        if (result.exitCode === 0 && root) return root;
    } catch {
        // Spawn failure; fall back below.
    }
    return cwd;
}

/**
 * Capture the protected-state baseline for one change.
 *
 * Writes `<root>/.specops-review-guard/<change>.json` (directory created on
 * demand). The store lives outside both the tracked set and the `openspec/`
 * walk and is filtered by {@link isIgnored}, so the guard never flags its own
 * artifact.
 */
export async function captureBaseline(
    change: string,
    root: string,
    deps: ReviewGuardDeps,
): Promise<CaptureResult> {
    const [tracked, openspec] = await Promise.all([
        enumerateTracked(root, deps.capture),
        enumerateOpenSpec(root),
    ]);
    const baseline: Baseline = {
        version: 1,
        change,
        root,
        capturedAt: new Date().toISOString(),
        tracked,
        openspec,
    };
    const storeDir = path.join(root, ".specops-review-guard");
    await mkdir(storeDir, { recursive: true });
    await writeFile(
        path.join(storeDir, `${change}.json`),
        `${JSON.stringify(baseline, null, 2)}\n`,
        "utf8",
    );
    return {
        operation: "capture",
        change,
        root,
        trackedCount: Object.keys(tracked).length,
        openspecCount: Object.keys(openspec).length,
    };
}

/**
 * Diff current protected-state maps against the baseline.
 *
 * `modified` — present in both with different hashes; `added` — present only
 * in the current state; `removed` — present only in the baseline. Scopes are
 * tagged so the coordinator can tell tracked from OpenSpec evidence.
 */
export function diffBaseline(baseline: Baseline, current: CurrentState): GuardViolation[] {
    const violations: GuardViolation[] = [];
    for (const scope of ["tracked", "openspec"] as const) {
        const before = baseline[scope];
        const after = current[scope];
        for (const [relPath, baselineHash] of Object.entries(before)) {
            const currentHash = after[relPath];
            if (currentHash === undefined) {
                violations.push({ path: relPath, kind: "removed", scope, baselineHash });
            } else if (currentHash !== baselineHash) {
                violations.push({
                    path: relPath,
                    kind: "modified",
                    scope,
                    baselineHash,
                    currentHash,
                });
            }
        }
        for (const [relPath, currentHash] of Object.entries(after)) {
            if (before[relPath] === undefined) {
                violations.push({ path: relPath, kind: "added", scope, currentHash });
            }
        }
    }
    return violations;
}

/**
 * Verify current protected state against the captured baseline for one change.
 *
 * Fails closed: when the baseline file is absent or unusable the result
 * reports `missingBaseline: true` so the coordinator must block rather than
 * continue with an unguarded review.
 */
export async function verifyBaseline(
    change: string,
    root: string,
    deps: ReviewGuardDeps,
): Promise<GuardResult> {
    const baseline = await readBaseline(change, root);
    if (!baseline) return { mutated: false, missingBaseline: true, violations: [] };
    const [tracked, openspec] = await Promise.all([
        enumerateTracked(root, deps.capture),
        enumerateOpenSpec(root),
    ]);
    const violations = diffBaseline(baseline, { tracked, openspec });
    return { mutated: violations.length > 0, violations };
}

/** Read and shape-check the stored baseline, returning undefined when unusable. */
async function readBaseline(change: string, root: string): Promise<Baseline | undefined> {
    let raw: string;
    try {
        raw = await readFile(path.join(root, ".specops-review-guard", `${change}.json`), "utf8");
    } catch {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw) as Partial<Baseline>;
        if (
            parsed.version === 1 &&
            typeof parsed.change === "string" &&
            typeof parsed.root === "string" &&
            isHashRecord(parsed.tracked) &&
            isHashRecord(parsed.openspec)
        ) {
            return parsed as Baseline;
        }
    } catch {
        // Corrupt JSON; fail closed below.
    }
    return undefined;
}

/** Whether a value is a plain record of string hashes. */
function isHashRecord(value: unknown): value is Record<string, string> {
    return (
        value != null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(value).every(entry => typeof entry === "string")
    );
}

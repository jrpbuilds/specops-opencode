import { readFile } from "node:fs/promises";

/**
 * Verify that the aggregate line coverage in an LCOV report meets a threshold.
 *
 * The script sums every `LF:` (instrumented lines) and `LH:` (covered lines)
 * record across all source files, then succeeds only when the ratio is >= the
 * requested threshold. This intentionally gates lines only, matching the
 * approved coverage policy.
 */
async function main(): Promise<void> {
    const [, , reportPath, thresholdArg] = process.argv;
    if (!reportPath || !thresholdArg) {
        console.error("Usage: bun scripts/check-line-coverage.ts <lcov.info> <threshold-percent>");
        process.exit(2);
    }

    const threshold = Number(thresholdArg);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) {
        console.error(`Invalid threshold: ${thresholdArg}`);
        process.exit(2);
    }

    let report: string;
    try {
        report = await readFile(reportPath, "utf8");
    } catch (error) {
        console.error(`Could not read coverage report at ${reportPath}: ${errorMessage(error)}`);
        process.exit(1);
    }

    let instrumented = 0;
    let covered = 0;
    for (const line of report.split(/\r?\n/)) {
        if (line.startsWith("LF:")) {
            instrumented += Number(line.slice(3)) || 0;
        } else if (line.startsWith("LH:")) {
            covered += Number(line.slice(3)) || 0;
        }
    }

    if (instrumented === 0) {
        console.error(
            `No instrumented lines found in ${reportPath}; report is empty or malformed.`,
        );
        process.exit(1);
    }

    const ratio = covered / instrumented;
    const percentage = (ratio * 100).toFixed(2);

    if (ratio * 100 < threshold) {
        console.error(
            `Line coverage ${percentage}% is below the required ${threshold}% ` +
                `(${covered}/${instrumented} lines).`,
        );
        process.exit(1);
    }

    console.log(
        `Line coverage ${percentage}% meets the ${threshold}% threshold (${covered}/${instrumented} lines).`,
    );
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

main().catch(error => {
    console.error(errorMessage(error));
    process.exit(1);
});

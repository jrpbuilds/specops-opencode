import { describe, expect, test } from "bun:test";
import { parseReviewerVerdict } from "../../src/coordinator/reviewer-verdict.js";

describe("parseReviewerVerdict", () => {
    test("reads a PASS outcome line", () => {
        expect(parseReviewerVerdict("PASS\nCompliance matrix:\n- R1 — VERIFIED")).toBe("pass");
    });

    test("reads a FAIL outcome line", () => {
        expect(parseReviewerVerdict("FAIL\nF1 — something broke")).toBe("fail");
    });

    test("skips blank lines before the outcome", () => {
        expect(parseReviewerVerdict("\n\nPASS\nok")).toBe("pass");
    });

    test("strips a leading background task envelope before matching", () => {
        expect(parseReviewerVerdict('<task id="ses_child" state="completed">FAIL\nF1</task>')).toBe(
            "fail",
        );
    });

    test("reads the verdict through OpenCode's background <task_result> wrapper", () => {
        // The exact shape recorded for background task completions: the
        // completed envelope wraps the specialist's final message in a
        // <task_result> block.
        const envelope =
            '<task id="ses_child" state="completed">\n<task_result>\nPASS\n\n' +
            "Independent review complete.\n\n## Compliance matrix\n\n- R1 — VERIFIED\n" +
            "</task_result>\n</task>";
        expect(parseReviewerVerdict(envelope)).toBe("pass");
    });

    test("reads a wrapped FAIL verdict", () => {
        const envelope =
            '<task id="ses_child" state="completed">\n<task_result>\nFAIL\nF1 — broken\n' +
            "</task_result>\n</task>";
        expect(parseReviewerVerdict(envelope)).toBe("fail");
    });

    test("strips the wrapper even with surrounding whitespace", () => {
        expect(
            parseReviewerVerdict('<task id="c" state="completed">\r\n  <task_result>  \r\nPASS'),
        ).toBe("pass");
    });

    test("keeps prose before the outcome unresolved even inside the wrapper", () => {
        const envelope =
            '<task id="c" state="completed">\n<task_result>\nSummary first.\nPASS\n</task_result>\n</task>';
        expect(parseReviewerVerdict(envelope)).toBeUndefined();
    });

    test("treats a bare wrapper without a verdict line as unresolved", () => {
        expect(parseReviewerVerdict("<task_result>\nmatrix text\n</task_result>")).toBeUndefined();
    });

    test("leaves a frontier-eligible blocker unresolved", () => {
        expect(
            parseReviewerVerdict("FRONTIER ELIGIBLE BLOCKER\n<unresolved ambiguity>"),
        ).toBeUndefined();
    });

    test("leaves an error envelope unresolved", () => {
        expect(
            parseReviewerVerdict(
                '<task id="ses_child" state="error"><task_error>boom</task_error></task>',
            ),
        ).toBeUndefined();
    });

    test("never reads prose or matrix mentions as the verdict", () => {
        expect(parseReviewerVerdict("The change did not PASS review")).toBeUndefined();
        expect(parseReviewerVerdict("Compliance matrix:\n- R1 — PASSING")).toBeUndefined();
    });

    test("is strict about the outcome word", () => {
        expect(parseReviewerVerdict("pass\nsummary")).toBeUndefined();
        expect(parseReviewerVerdict("PASS.")).toBeUndefined();
    });

    test("leaves empty and missing results unresolved", () => {
        expect(parseReviewerVerdict("")).toBeUndefined();
        expect(parseReviewerVerdict("   \n  ")).toBeUndefined();
        expect(parseReviewerVerdict(undefined)).toBeUndefined();
    });
});

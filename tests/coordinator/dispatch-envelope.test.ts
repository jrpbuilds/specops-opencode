import { describe, expect, test } from "bun:test";
import { parseChangeName } from "../../src/coordinator/dispatch-envelope.js";

describe("parseChangeName", () => {
    test("is absent from undefined, empty, and prompts without the token", () => {
        expect(parseChangeName(undefined)).toEqual({ status: "absent" });
        expect(parseChangeName("")).toEqual({ status: "absent" });
        expect(parseChangeName("Implement the assigned tasks in dependency order.")).toEqual({
            status: "absent",
        });
    });

    test("ignores mid-line prose mentions of the token", () => {
        expect(
            parseChangeName(
                "Task 1.2 says every dispatch must carry changeName: <change> on its own line.",
            ),
        ).toEqual({ status: "absent" });
        expect(
            parseChangeName(
                [
                    "Implement the change.",
                    "- [ ] 1.2 Send the assignment line starting with assignedTaskIds;",
                    "  the envelope's changeName: <change> line is validated too.",
                ].join("\n"),
            ),
        ).toEqual({ status: "absent" });
    });

    test("reads the canonical line", () => {
        expect(parseChangeName("changeName: example")).toEqual({
            status: "present",
            change: "example",
        });
    });

    test("reads the canonical line among other dispatch content", () => {
        expect(
            parseChangeName(
                [
                    "Implement the assigned tasks.",
                    "changeName: example",
                    "assignedTaskIds: 2.1, 2.2",
                ].join("\n"),
            ),
        ).toEqual({ status: "present", change: "example" });
    });

    test("accepts the no-space form, surrounding whitespace, and CRLF line endings", () => {
        expect(parseChangeName("changeName:example")).toEqual({
            status: "present",
            change: "example",
        });
        expect(parseChangeName("  changeName:   example  ")).toEqual({
            status: "present",
            change: "example",
        });
        expect(parseChangeName("Implement first.\r\nchangeName: example\r\nThen report.")).toEqual({
            status: "present",
            change: "example",
        });
    });

    test("a line-initial payload the parser cannot read is malformed, never absent", () => {
        expect(parseChangeName("changeName = example")).toEqual({
            status: "malformed",
            reason: "changeName appears but no line matches 'changeName: <change>'",
        });
        expect(parseChangeName("changeName is example")).toEqual({
            status: "malformed",
            reason: "changeName appears but no line matches 'changeName: <change>'",
        });
    });

    test("multiple canonical lines are malformed", () => {
        expect(parseChangeName("changeName: example\nchangeName: other")).toEqual({
            status: "malformed",
            reason: "multiple canonical changeName lines",
        });
    });

    test("a bare token line is malformed, never an empty identity", () => {
        expect(parseChangeName("changeName:")).toEqual({
            status: "malformed",
            reason: "changeName appears but no line matches 'changeName: <change>'",
        });
        expect(parseChangeName("changeName:   ")).toEqual({
            status: "malformed",
            reason: "changeName appears but no line matches 'changeName: <change>'",
        });
    });

    test("a value with internal whitespace is malformed", () => {
        expect(parseChangeName("changeName: two words")).toEqual({
            status: "malformed",
            reason: "change name 'two words' contains whitespace",
        });
    });

    test("the token must start the line: prefixes keep the dispatch absent", () => {
        expect(parseChangeName("dispatch changeName: example")).toEqual({ status: "absent" });
    });
});

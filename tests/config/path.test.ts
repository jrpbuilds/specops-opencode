import path from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveConfigPath } from "../../src/config.js";

describe("resolveConfigPath", () => {
    test("defaults to ~/.config/opencode/specops.json", () => {
        expect(resolveConfigPath({}, "/home/jake")).toBe(
            path.join("/home/jake", ".config", "opencode", "specops.json"),
        );
    });

    test("honours XDG_CONFIG_HOME when set", () => {
        expect(resolveConfigPath({ XDG_CONFIG_HOME: "/custom/xdg" }, "/home/jake")).toBe(
            path.join("/custom/xdg", "opencode", "specops.json"),
        );
    });

    test("uses the supplied home directory", () => {
        expect(resolveConfigPath({}, "/data/users/jake")).toBe(
            path.join("/data/users/jake", ".config", "opencode", "specops.json"),
        );
    });

    test("XDG_CONFIG_HOME wins over the default home-based path", () => {
        const home = path.join("/home", "jake");
        const xdg = resolveConfigPath({ XDG_CONFIG_HOME: "/env/xdg" }, home);
        const fallback = resolveConfigPath({}, home);
        expect(xdg).not.toBe(fallback);
        expect(xdg).toBe(path.join("/env/xdg", "opencode", "specops.json"));
    });
});

import type { Plugin } from "@opencode-ai/plugin";

export type ToolDraft = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0];

export const EMPTY_INPUT = {
    type: "object",
    properties: {},
    additionalProperties: false,
} as const;

export const CHANGE_INPUT = {
    type: "object",
    properties: { change: { type: "string" } },
    required: ["change"],
    additionalProperties: false,
} as const;

export const CREATE_CHANGE_INPUT = {
    type: "object",
    properties: {
        change: { type: "string" },
        goal: { type: "string" },
    },
    required: ["change"],
    additionalProperties: false,
} as const;

export function stringField(input: unknown, field: string): string {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error(`SpecOps tool input must be an object`);
    }
    const value = (input as Record<string, unknown>)[field];
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    return value;
}

export function optionalStringField(input: unknown, field: string): string | undefined {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const value = (input as Record<string, unknown>)[field];
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    return value;
}

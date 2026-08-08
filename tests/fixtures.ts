import type { ConfiguredProvider } from "../src/models.js";

/**
 * A provider that explicitly sets `providerID` on each model. Used to verify
 * that model IDs use `model.providerID` rather than the provider-level `id`.
 */
export const providerWithModelProviderID: ConfiguredProvider = {
    id: "openference",
    name: "Openference",
    models: {
        "GLM-5.2": {
            id: "GLM-5.2",
            providerID: "openference",
            name: "GLM-5.2",
            variants: { low: {}, medium: {}, high: {} },
        },
        "MiniMax M3": {
            id: "MiniMax M3",
            providerID: "openference",
            name: "MiniMax M3",
            variants: { none: {}, thinking: {} },
        },
    },
};

/**
 * A provider whose models omit `providerID`, so ids fall back to `provider.id`.
 */
export const providerWithoutModelProviderID: ConfiguredProvider = {
    id: "openai",
    name: "OpenAI",
    models: {
        "gpt-5": {
            id: "gpt-5",
            providerID: "",
            name: "GPT-5",
            variants: { low: {}, high: {} },
        },
        "gpt-4o": {
            id: "gpt-4o",
            providerID: "",
            name: "GPT-4o",
        },
    },
};

/** Both providers together, in a fixed order for flattening tests. */
export const allProviders: readonly ConfiguredProvider[] = [
    providerWithoutModelProviderID,
    providerWithModelProviderID,
];

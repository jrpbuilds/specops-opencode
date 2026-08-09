import type { ConfiguredProvider } from "../src/models.js";

/**
 * A provider that explicitly sets `providerID` on each model. Used to verify
 * that model IDs use `model.providerID` rather than the provider-level `id`.
 * It also supplies multiple variants so sorting and variant-preservation tests
 * can exercise the normalized model shape.
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
 * One model has variants and one has none to cover both optional catalogue
 * shapes returned by OpenCode.
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

/**
 * Both providers together in a deliberately non-alphabetical order.
 *
 * Tests can therefore distinguish input order from the stable sorting promised
 * by `configuredModels`.
 */
export const allProviders: readonly ConfiguredProvider[] = [
    providerWithoutModelProviderID,
    providerWithModelProviderID,
];

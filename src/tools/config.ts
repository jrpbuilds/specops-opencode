import type { FanoutMode, SpecOpsConfig } from "../config.js";

/**
 * Allow-listed, coordinator-relevant view of the effective SpecOps configuration.
 *
 * This is a stable, explicit API surface — NOT the raw `specops.json` shape.
 * Adding a new internal or host-only setting to {@link SpecOpsConfig} does not
 * automatically expose it to coordinators; extend this type deliberately when a
 * coordinator genuinely needs to reason about a new effective setting.
 *
 * Values represent the configuration active for the current OpenCode process.
 * SpecOps configuration changes require an OpenCode restart before they become
 * effective; this view does not support live reload.
 */
export type CoordinatorConfigView = {
    maxSubagentConcurrency: number;
    maxAutoReviewIterations: number;
    frontierEscalation: boolean;
    implementerFanout: FanoutMode;
    reviewFanout: FanoutMode;
};

/**
 * Dependency boundary keeping the view builder deterministic and host-free.
 *
 * The effective config is supplied through {@link ConfigViewDeps.getConfig} so
 * the same function can run against the process snapshot, a test fixture, or a
 * captured configuration without touching the filesystem.
 */
export type ConfigViewDeps = {
    getConfig: () => SpecOpsConfig;
};

/**
 * Build the allow-listed coordinator config view from a validated config.
 *
 * The normalized `SpecOpsConfig` already carries concrete values for every
 * allow-listed field, so the view copies them directly rather than re-defaulting.
 * The returned object is a fresh copy; mutating it does not affect the supplied
 * configuration.
 *
 * @param deps Provides the effective SpecOps configuration.
 * @returns A structured coordinator config view; the tool wrapper handles JSON
 *     serialization.
 */
export function configView(deps: ConfigViewDeps): CoordinatorConfigView {
    const config = deps.getConfig();
    return {
        maxSubagentConcurrency: config.maxSubagentConcurrency,
        maxAutoReviewIterations: config.maxAutoReviewIterations,
        frontierEscalation: config.frontierEscalation,
        implementerFanout: config.implementerFanout,
        reviewFanout: config.reviewFanout,
    };
}

import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { ConfiguredProvider } from "../../src/models.js";

export type FakeCommand = {
    name: string;
    title: string;
    namespace?: string;
    category?: string;
    run?: () => void | Promise<void>;
};

export type DialogOption = { title: string; value: unknown };

export type DialogProps = {
    title?: string;
    message?: string;
    current?: unknown;
    options?: readonly DialogOption[];
    onSelect?: (option: DialogOption) => void;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
};

export type FakeTui = {
    api: TuiPluginApi;
    commands: FakeCommand[];
    toasts: Array<Record<string, unknown>>;
    replaceCount: number;
    isCommandRegistered: boolean;
    currentDialog: () => DialogProps | undefined;
    runCommand: () => Promise<void>;
    selectByValue: (value: unknown) => void;
    confirm: () => Promise<void>;
    cancel: () => void;
    dispose: () => void;
};

/**
 * Run a TUI test with the real config resolver pointed at an isolated directory.
 *
 * The previous environment value is restored even when the callback fails, so
 * tests cannot leak their temporary XDG configuration home.
 */
export async function withConfigHome<T>(home: string, fn: () => Promise<T>): Promise<T> {
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = home;
    try {
        return await fn();
    } finally {
        if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
        else process.env.XDG_CONFIG_HOME = previous;
    }
}

/**
 * Build the smallest host surface needed to drive registerModelSettings.
 * Dialog component calls return their props, letting tests invoke real
 * selection and confirmation callbacks without rendering OpenTUI.
 * The returned harness also records command registration, dialog replacement,
 * toasts, and disposal so lifecycle behavior can be asserted directly.
 */
export function fakeTuiApi(providers: readonly ConfiguredProvider[]): FakeTui {
    const commands: FakeCommand[] = [];
    const toasts: Array<Record<string, unknown>> = [];
    const disposeCallbacks: Array<() => void> = [];
    let dialogRender: (() => unknown) | undefined;
    let dialogOnClose: (() => void) | undefined;
    let replaceCount = 0;
    let isCommandRegistered = false;

    const dialog = {
        replace(render: () => unknown, onClose?: () => void): void {
            dialogRender = render;
            dialogOnClose = onClose;
            replaceCount += 1;
        },
        clear(): void {
            dialogRender = undefined;
            dialogOnClose = undefined;
        },
        setSize(): void {},
    };

    const api = {
        keymap: {
            registerLayer(input: { commands: FakeCommand[] }): () => void {
                commands.push(...input.commands);
                isCommandRegistered = true;
                return () => {
                    isCommandRegistered = false;
                };
            },
        },
        lifecycle: {
            onDispose(callback: () => void): () => void {
                disposeCallbacks.push(callback);
                return () => undefined;
            },
        },
        state: { provider: providers },
        ui: {
            toast(input: Record<string, unknown>): void {
                toasts.push(input);
            },
            dialog,
            DialogSelect(props: unknown): unknown {
                return props;
            },
            DialogConfirm(props: unknown): unknown {
                return props;
            },
            DialogAlert(props: unknown): unknown {
                return props;
            },
        },
    } as unknown as TuiPluginApi;

    const currentDialog = (): DialogProps | undefined =>
        dialogRender ? (dialogRender() as DialogProps) : undefined;

    return {
        api,
        commands,
        toasts,
        get replaceCount() {
            return replaceCount;
        },
        get isCommandRegistered() {
            return isCommandRegistered;
        },
        currentDialog,
        async runCommand(): Promise<void> {
            const command = commands[0];
            if (!command?.run) throw new Error("fake TUI command is not registered");
            await command.run();
        },
        selectByValue(value: unknown): void {
            const props = currentDialog();
            const option = props?.options?.find(candidate => candidate.value === value);
            if (!props?.onSelect || !option) {
                throw new Error(`dialog option not found: ${String(value)}`);
            }
            props.onSelect(option);
        },
        async confirm(): Promise<void> {
            const props = currentDialog();
            if (!props?.onConfirm) throw new Error("current dialog has no confirm callback");
            await props.onConfirm();
        },
        cancel(): void {
            const props = currentDialog();
            if (!props?.onCancel) throw new Error("current dialog has no cancel callback");
            props.onCancel();
        },
        dispose(): void {
            for (const callback of disposeCallbacks) callback();
            dialogOnClose?.();
        },
    };
}

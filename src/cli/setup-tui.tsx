/**
 * OpenTUI-powered provider setup wizard.
 *
 * Walks the user through configuring providers, models, and advanced options
 * with a stepped, themed interface. Falls back to the readline-style flow in
 * non-TTY environments (see `setup.ts`).
 *
 * @author dev
 */

import { TextAttributes } from "@opentui/core";
import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { For, Match, Show, Switch, batch, createMemo, createSignal } from "solid-js";
import {
  loadRecodeConfigFile,
  resolveConfigPath,
  saveRecodeConfigFile,
  upsertConfiguredProvider,
  type ConfiguredModel,
  type ConfiguredProvider,
  type RecodeConfigFile
} from "../config/recode-config.ts";
import { fetchOpenAiCompatibleModels } from "../models/list-models.ts";
import {
  getDefaultProviderBaseUrl,
  getDefaultProviderName,
  PROVIDER_PRESETS,
  providerSupportsModelListing,
  type ProviderKind
} from "../providers/provider-kind.ts";
import { isJsonObject, type JsonObject } from "../shared/json-value.ts";
import {
  DEFAULT_THEME_NAME,
  getTheme,
  type ThemeColors
} from "../tui/appearance/theme.ts";

/**
 * Outcome captured by the wizard so the caller can print a confirmation line
 * after the alternate screen has been restored.
 */
interface SetupOutcome {
  savedCount: number;
  configPath: string;
}

interface ProviderDraft {
  readonly editingExistingId: string | undefined;
  readonly kind: ProviderKind;
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly models: readonly ConfiguredModel[];
  readonly defaultModelId: string;
  readonly contextWindow: string;
  readonly maxOutputTokens: string;
  readonly temperature: string;
  readonly toolChoice: "default" | "auto" | "required";
  readonly headersJson: string;
  readonly optionsJson: string;
  readonly makeActive: boolean;
}

type Step =
  | "welcome"
  | "target"
  | "kind"
  | "identity"
  | "modelsMode"
  | "modelsFetching"
  | "modelsSelect"
  | "modelsManual"
  | "advancedAsk"
  | "advanced"
  | "review"
  | "saved";

const CREATE_NEW_ID = "__create_new__";
const CUSTOM_MODEL_ID = "__custom_model__";

/**
 * Launch the OpenTUI setup wizard.
 *
 * Resolves once the user exits the wizard. Returns the number of providers
 * saved so the caller can decide whether to print a confirmation line.
 */
export async function runSetupTui(workspaceRoot: string): Promise<{
  savedCount: number;
  configPath: string;
}> {
  const configPath = resolveConfigPath(workspaceRoot, Bun.env.RECODE_CONFIG_PATH?.trim());
  const initialConfig = loadRecodeConfigFile(configPath);
  const outcome: SetupOutcome = { savedCount: 0, configPath };
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  await render(
    () => (
      <SetupApp
        configPath={configPath}
        initialConfig={initialConfig}
        outcome={outcome}
      />
    ),
    {
      targetFps: 30,
      screenMode: "alternate-screen",
      useMouse: false,
      exitOnCtrlC: true,
      onDestroy: () => {
        resolveDone?.();
      }
    }
  );
  await done;

  return outcome;
}

interface SetupAppProps {
  readonly configPath: string;
  readonly initialConfig: RecodeConfigFile;
  readonly outcome: SetupOutcome;
}

function SetupApp(props: SetupAppProps) {
  const renderer = useRenderer();
  const theme = getTheme(props.initialConfig.themeName ?? DEFAULT_THEME_NAME);
  const terminal = useTerminalDimensions();

  const [config, setConfig] = createSignal<RecodeConfigFile>(props.initialConfig);
  const [draft, setDraft] = createSignal<ProviderDraft>(blankDraft(props.initialConfig));
  const [step, setStep] = createSignal<Step>(
    props.initialConfig.providers.length === 0 ? "welcome" : "welcome"
  );
  const [statusMessage, setStatusMessage] = createSignal<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = createSignal<string | undefined>(undefined);

  const panelWidth = createMemo(() =>
    Math.max(48, Math.min(terminal().width - 4, 84))
  );

  const stepIndex = createMemo(() => {
    switch (step()) {
      case "welcome":
        return 0;
      case "target":
        return 1;
      case "kind":
        return 2;
      case "identity":
        return 3;
      case "modelsMode":
      case "modelsFetching":
      case "modelsSelect":
      case "modelsManual":
        return 4;
      case "advancedAsk":
      case "advanced":
        return 5;
      case "review":
        return 6;
      case "saved":
        return 7;
      default:
        return 0;
    }
  });

  const STEP_LABELS = [
    "Welcome",
    "Target",
    "Kind",
    "Connection",
    "Models",
    "Tuning",
    "Review",
    "Done"
  ] as const;

  function clearMessages(): void {
    setStatusMessage(undefined);
    setErrorMessage(undefined);
  }

  function startEditFor(provider: ConfiguredProvider): void {
    batch(() => {
      setDraft(draftFromExisting(provider, config().activeProviderId === provider.id));
      clearMessages();
      setStep("kind");
    });
  }

  function startCreateNew(): void {
    batch(() => {
      setDraft(blankDraft(config()));
      clearMessages();
      setStep("kind");
    });
  }

  function back(target: Step): void {
    clearMessages();
    setStep(target);
  }

  function handleSavedExit(): void {
    renderer.destroy();
  }

  function commitProvider(): void {
    const current = draft();
    const headers = parseOptionalStringRecord(current.headersJson);
    if (headers === "error") {
      setErrorMessage("Headers must be valid JSON of {string: string} or empty.");
      return;
    }

    const options = parseOptionalJsonObject(current.optionsJson);
    if (options === "error") {
      setErrorMessage("Provider options must be a valid JSON object or empty.");
      return;
    }

    const maxOutputTokens = parsePositiveInt(current.maxOutputTokens);
    if (maxOutputTokens === "error") {
      setErrorMessage("Max output tokens must be a positive integer or empty.");
      return;
    }

    const temperature = parseNumber(current.temperature);
    if (temperature === "error") {
      setErrorMessage("Temperature must be a number or empty.");
      return;
    }

    const contextWindow = parsePositiveInt(current.contextWindow);
    if (contextWindow === "error") {
      setErrorMessage("Context window must be a positive integer or empty.");
      return;
    }

    const trimmedId = normalizeProviderId(current.id);
    if (trimmedId === "") {
      setErrorMessage("Provider ID is required.");
      return;
    }
    const trimmedName = current.name.trim();
    if (trimmedName === "") {
      setErrorMessage("Provider name is required.");
      return;
    }
    const trimmedBaseUrl = current.baseUrl.trim();
    if (trimmedBaseUrl === "") {
      setErrorMessage("Base URL is required.");
      return;
    }
    const trimmedDefault = current.defaultModelId.trim();
    if (trimmedDefault === "") {
      setErrorMessage("Default model is required.");
      return;
    }

    const apiKey = current.apiKey.trim();
    const finalModels = ensureDefaultModel(
      current.models,
      trimmedDefault,
      contextWindow === undefined ? undefined : contextWindow
    );

    const provider: ConfiguredProvider = {
      id: trimmedId,
      name: trimmedName,
      kind: current.kind,
      baseUrl: trimmedBaseUrl,
      models: finalModels,
      defaultModelId: trimmedDefault,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(current.toolChoice === "default" ? {} : { toolChoice: current.toolChoice }),
      ...(headers === undefined ? {} : { headers }),
      ...(options === undefined ? {} : { options }),
      ...(apiKey === "" ? {} : { apiKey })
    };

    const nextConfig = upsertConfiguredProvider(config(), provider, current.makeActive);
    try {
      saveRecodeConfigFile(props.configPath, nextConfig);
    } catch (error) {
      setErrorMessage(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    batch(() => {
      setConfig(nextConfig);
      props.outcome.savedCount += 1;
      setStatusMessage(`Saved provider '${provider.name}'.`);
      setErrorMessage(undefined);
      setStep("saved");
    });
  }

  async function startModelFetch(): Promise<void> {
    const current = draft();
    setStep("modelsFetching");
    setErrorMessage(undefined);
    setStatusMessage("Contacting provider for available models...");

    try {
      const remoteModels = await fetchOpenAiCompatibleModels({
        baseUrl: current.baseUrl.trim(),
        ...(current.apiKey.trim() === "" ? {} : { apiKey: current.apiKey.trim() })
      });

      if (remoteModels.length === 0) {
        batch(() => {
          setStatusMessage("Provider returned no models. Enter model IDs manually.");
          setStep("modelsManual");
        });
        return;
      }

      const merged = mergeModelsPreservingMetadata(current.models, remoteModels);
      batch(() => {
        setDraft({
          ...current,
          models: merged,
          defaultModelId:
            current.defaultModelId !== "" && merged.some((model) => model.id === current.defaultModelId)
              ? current.defaultModelId
              : merged[0]?.id ?? ""
        });
        setStatusMessage(`Fetched ${remoteModels.length} model(s) from provider.`);
        setStep("modelsSelect");
      });
    } catch (error) {
      batch(() => {
        setErrorMessage(`Unable to fetch models: ${error instanceof Error ? error.message : String(error)}`);
        setStatusMessage(undefined);
        setStep("modelsManual");
      });
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape" && step() !== "modelsFetching" && step() !== "saved") {
      clearMessages();
      handleEscape();
    }
  });

  function handleEscape(): void {
    switch (step()) {
      case "welcome":
        renderer.destroy();
        return;
      case "target":
        setStep("welcome");
        return;
      case "kind":
        if (config().providers.length > 0) {
          setStep("target");
        } else {
          setStep("welcome");
        }
        return;
      case "identity":
        setStep("kind");
        return;
      case "modelsMode":
      case "modelsManual":
        setStep("identity");
        return;
      case "modelsSelect":
        setStep(providerSupportsModelListing(draft().kind) ? "modelsMode" : "modelsManual");
        return;
      case "advancedAsk":
        setStep(draft().models.length === 0 ? "modelsManual" : "modelsSelect");
        return;
      case "advanced":
        setStep("advancedAsk");
        return;
      case "review":
        setStep("advancedAsk");
        return;
      default:
        return;
    }
  }

  return (
    <box
      width={terminal().width}
      height={terminal().height}
      backgroundColor={theme.inverseText}
      flexDirection="column"
      alignItems="center"
      paddingTop={1}
    >
      <WizardChrome
        theme={theme}
        title="Recode Setup"
        configPath={props.configPath}
        stepIndex={stepIndex()}
        stepLabels={STEP_LABELS}
        panelWidth={panelWidth()}
      />
      <box
        width={panelWidth()}
        flexDirection="column"
        border
        borderColor={theme.brandShimmer}
        backgroundColor={theme.inverseText}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
        marginTop={1}
      >
        <Switch>
          <Match when={step() === "welcome"}>
            <WelcomeStep
              theme={theme}
              configPath={props.configPath}
              config={config()}
              onCreateNew={() => {
                clearMessages();
                if (config().providers.length === 0) {
                  startCreateNew();
                } else {
                  setStep("target");
                }
              }}
              onEditExisting={() => {
                clearMessages();
                if (config().providers.length === 0) {
                  startCreateNew();
                } else {
                  setStep("target");
                }
              }}
              onExit={() => renderer.destroy()}
            />
          </Match>

          <Match when={step() === "target"}>
            <TargetStep
              theme={theme}
              config={config()}
              onSelect={(providerId) => {
                if (providerId === CREATE_NEW_ID) {
                  startCreateNew();
                  return;
                }
                const existing = config().providers.find((provider) => provider.id === providerId);
                if (existing !== undefined) {
                  startEditFor(existing);
                }
              }}
            />
          </Match>

          <Match when={step() === "kind"}>
            <KindStep
              theme={theme}
              draft={draft()}
              onSelect={(kind) => {
                const current = draft();
                batch(() => {
                  setDraft({
                    ...current,
                    kind,
                    id:
                      current.editingExistingId === undefined
                        ? suggestNewProviderId(config(), kind)
                        : current.id,
                    name:
                      current.editingExistingId === undefined || current.name === ""
                        ? getDefaultProviderName(kind)
                        : current.name,
                    baseUrl:
                      current.editingExistingId === undefined || current.baseUrl === ""
                        ? getDefaultProviderBaseUrl(kind)
                        : current.baseUrl
                  });
                  setStep("identity");
                });
              }}
            />
          </Match>

          <Match when={step() === "identity"}>
            <IdentityStep
              theme={theme}
              draft={draft()}
              error={errorMessage()}
              onUpdate={(patch) => setDraft({ ...draft(), ...patch })}
              onSubmit={() => {
                const current = draft();
                const id = normalizeProviderId(current.id);
                if (id === "") {
                  setErrorMessage("Provider ID is required.");
                  return;
                }
                if (current.name.trim() === "") {
                  setErrorMessage("Provider name is required.");
                  return;
                }
                if (current.baseUrl.trim() === "") {
                  setErrorMessage("Base URL is required.");
                  return;
                }
                clearMessages();
                setDraft({ ...current, id });
                setStep(
                  providerSupportsModelListing(current.kind) ? "modelsMode" : "modelsManual"
                );
              }}
            />
          </Match>

          <Match when={step() === "modelsMode"}>
            <ModelsModeStep
              theme={theme}
              draft={draft()}
              onSelect={(mode) => {
                clearMessages();
                if (mode === "fetch") {
                  void startModelFetch();
                  return;
                }
                setStep("modelsManual");
              }}
            />
          </Match>

          <Match when={step() === "modelsFetching"}>
            <FetchingStep theme={theme} message={statusMessage() ?? "Loading..."} />
          </Match>

          <Match when={step() === "modelsSelect"}>
            <ModelsSelectStep
              theme={theme}
              draft={draft()}
              status={statusMessage()}
              onPick={(modelId) => {
                if (modelId === CUSTOM_MODEL_ID) {
                  setDraft({ ...draft(), defaultModelId: "" });
                  setStep("modelsManual");
                  return;
                }
                clearMessages();
                setDraft({ ...draft(), defaultModelId: modelId });
                setStep("advancedAsk");
              }}
            />
          </Match>

          <Match when={step() === "modelsManual"}>
            <ModelsManualStep
              theme={theme}
              draft={draft()}
              error={errorMessage()}
              status={statusMessage()}
              onUpdate={(patch) => setDraft({ ...draft(), ...patch })}
              onSubmit={(ids, defaultModelId) => {
                const trimmedDefault = defaultModelId.trim();
                if (trimmedDefault === "") {
                  setErrorMessage("A default model ID is required.");
                  return;
                }

                const parsed = parseManualModels(ids);
                const merged = mergeModelsPreservingMetadata(draft().models, parsed);
                clearMessages();
                setDraft({
                  ...draft(),
                  models: ensureDefaultModel(merged, trimmedDefault),
                  defaultModelId: trimmedDefault
                });
                setStep("advancedAsk");
              }}
            />
          </Match>

          <Match when={step() === "advancedAsk"}>
            <AdvancedAskStep
              theme={theme}
              onSelect={(answer) => {
                clearMessages();
                if (answer === "skip") {
                  setStep("review");
                } else {
                  setStep("advanced");
                }
              }}
            />
          </Match>

          <Match when={step() === "advanced"}>
            <AdvancedStep
              theme={theme}
              draft={draft()}
              error={errorMessage()}
              onUpdate={(patch) => setDraft({ ...draft(), ...patch })}
              onCycleToolChoice={() => {
                const current = draft();
                const next: ProviderDraft["toolChoice"] =
                  current.toolChoice === "default"
                    ? "auto"
                    : current.toolChoice === "auto"
                      ? "required"
                      : "default";
                setDraft({ ...current, toolChoice: next });
              }}
              onSubmit={() => {
                clearMessages();
                setStep("review");
              }}
            />
          </Match>

          <Match when={step() === "review"}>
            <ReviewStep
              theme={theme}
              draft={draft()}
              error={errorMessage()}
              onToggleActive={() => setDraft({ ...draft(), makeActive: !draft().makeActive })}
              onSave={() => commitProvider()}
              onBack={() => back("advancedAsk")}
            />
          </Match>

          <Match when={step() === "saved"}>
            <SavedStep
              theme={theme}
              configPath={props.configPath}
              draft={draft()}
              status={statusMessage()}
              onAddAnother={() => {
                batch(() => {
                  setDraft(blankDraft(config()));
                  clearMessages();
                  setStep("target");
                });
              }}
              onExit={handleSavedExit}
            />
          </Match>
        </Switch>

        <Show when={errorMessage() !== undefined && step() !== "advancedAsk"}>
          <text fg={theme.error} marginTop={1}>{errorMessage()}</text>
        </Show>
      </box>

      <Footer theme={theme} step={step()} panelWidth={panelWidth()} />
    </box>
  );
}

interface WizardChromeProps {
  readonly theme: ThemeColors;
  readonly title: string;
  readonly configPath: string;
  readonly stepIndex: number;
  readonly stepLabels: readonly string[];
  readonly panelWidth: number;
}

function WizardChrome(props: WizardChromeProps) {
  return (
    <box width={props.panelWidth} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>
          {`◈ ${props.title}`}
        </text>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
          {`config: ${props.configPath}`}
        </text>
      </box>
      <box flexDirection="row" marginTop={1} alignItems="center">
        <For each={props.stepLabels}>
          {(label, index) => {
            const active = () => index() === props.stepIndex;
            const done = () => index() < props.stepIndex;
            return (
              <box flexDirection="row" alignItems="center" marginRight={1}>
                <text
                  fg={
                    active()
                      ? props.theme.brandShimmer
                      : done()
                        ? props.theme.success
                        : props.theme.hintText
                  }
                  attributes={active() ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  {`${done() ? "✓" : active() ? "●" : "○"} ${label}`}
                </text>
                <Show when={index() < props.stepLabels.length - 1}>
                  <text fg={props.theme.divider}> · </text>
                </Show>
              </box>
            );
          }}
        </For>
      </box>
    </box>
  );
}

interface FooterProps {
  readonly theme: ThemeColors;
  readonly step: Step;
  readonly panelWidth: number;
}

function Footer(props: FooterProps) {
  const hint = () => {
    switch (props.step) {
      case "welcome":
        return "Enter selects · Esc quits";
      case "target":
      case "kind":
      case "modelsMode":
      case "modelsSelect":
      case "advancedAsk":
        return "↑↓ navigate · Enter selects · Esc back";
      case "identity":
        return "Tab next field · Enter submits · Esc back";
      case "modelsManual":
        return "Tab next field · Enter submits · Esc back";
      case "advanced":
        return "Tab next field · Space cycles tool choice · Enter submits · Esc back";
      case "review":
        return "Tab next action · Space toggles active · Enter confirms · Esc back";
      case "modelsFetching":
        return "Talking to the provider...";
      case "saved":
        return "Enter selects · Esc closes";
      default:
        return "";
    }
  };

  return (
    <box
      width={props.panelWidth}
      marginTop={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{hint()}</text>
      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>Ctrl+C quits</text>
    </box>
  );
}

interface WelcomeStepProps {
  readonly theme: ThemeColors;
  readonly configPath: string;
  readonly config: RecodeConfigFile;
  readonly onCreateNew: () => void;
  readonly onEditExisting: () => void;
  readonly onExit: () => void;
}

function WelcomeStep(props: WelcomeStepProps) {
  const options = createMemo(() => {
    if (props.config.providers.length === 0) {
      return [
        {
          name: "Get started",
          description: "Configure your first provider and model",
          value: "start"
        },
        { name: "Exit", description: "Leave setup without changes", value: "exit" }
      ];
    }

    return [
      {
        name: "Configure a provider",
        description: "Add a new provider or edit an existing one",
        value: "configure"
      },
      { name: "Exit", description: "Leave setup without changes", value: "exit" }
    ];
  });

  return (
    <box flexDirection="column">
      <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>
        Welcome to Recode
      </text>
      <text fg={props.theme.hintText}>
        This wizard saves provider and model details to your global config so
        the CLI and TUI know which backend to use.
      </text>

      <Show
        when={props.config.providers.length > 0}
        fallback={
          <box
            marginTop={1}
            border
            borderColor={props.theme.promptBorder}
            paddingLeft={1}
            paddingRight={1}
            flexDirection="column"
          >
            <text fg={props.theme.text}>
              No providers configured yet. We'll create one together.
            </text>
            <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
              Need an API key first? Get one from your provider's dashboard.
            </text>
          </box>
        }
      >
        <box
          marginTop={1}
          border
          borderColor={props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
          flexDirection="column"
        >
          <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
            Configured providers
          </text>
          <For each={props.config.providers}>
            {(provider) => {
              const active = props.config.activeProviderId === provider.id;
              return (
                <text
                  fg={active ? props.theme.active : props.theme.text}
                  attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
                >
                  {`${active ? "● " : "  "}${provider.name} (${provider.id}) → ${provider.defaultModelId ?? "no default"}`}
                </text>
              );
            }}
          </For>
        </box>
      </Show>

      <box marginTop={1}>
        <select
          height={Math.min(6, options().length * 2 + 1)}
          options={options()}
          focused
          onSelect={(_index, option) => {
            if (option === null) {
              return;
            }
            if (option.value === "exit") {
              props.onExit();
              return;
            }
            if (props.config.providers.length === 0) {
              props.onCreateNew();
            } else {
              props.onEditExisting();
            }
          }}
        />
      </box>
    </box>
  );
}

interface TargetStepProps {
  readonly theme: ThemeColors;
  readonly config: RecodeConfigFile;
  readonly onSelect: (providerId: string) => void;
}

function TargetStep(props: TargetStepProps) {
  const options = createMemo(() => [
    {
      name: "+ New provider",
      description: "Add another provider definition",
      value: CREATE_NEW_ID
    },
    ...props.config.providers.map((provider) => ({
      name: `${provider.name} (${provider.id})`,
      description: `${provider.kind} · ${provider.defaultModelId ?? "no default model"}${
        props.config.activeProviderId === provider.id ? " · active" : ""
      }`,
      value: provider.id
    }))
  ]);

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Which provider would you like to configure?
      </text>
      <text fg={props.theme.hintText}>
        Pick an existing entry to edit its details, or create a new one.
      </text>
      <box marginTop={1}>
        <select
          height={Math.min(12, options().length * 2 + 1)}
          options={options()}
          focused
          onSelect={(_index, option) => {
            if (option !== null && typeof option.value === "string") {
              props.onSelect(option.value);
            }
          }}
        />
      </box>
    </box>
  );
}

interface KindStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly onSelect: (kind: ProviderKind) => void;
}

function KindStep(props: KindStepProps) {
  const options = createMemo(() =>
    PROVIDER_PRESETS.map((preset) => ({
      name: preset.label,
      description: preset.setupHint,
      value: preset.kind
    }))
  );

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Pick the provider kind
      </text>
      <text fg={props.theme.hintText}>
        This determines the API protocol Recode uses to talk to the backend.
      </text>
      <box marginTop={1}>
        <select
          height={Math.min(14, options().length * 2 + 1)}
          options={options()}
          selectedIndex={Math.max(
            0,
            options().findIndex((option) => option.value === props.draft.kind)
          )}
          focused
          onSelect={(_index, option) => {
            if (option !== null && typeof option.value === "string") {
              props.onSelect(option.value as ProviderKind);
            }
          }}
        />
      </box>
    </box>
  );
}

interface IdentityStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly error: string | undefined;
  readonly onUpdate: (patch: Partial<ProviderDraft>) => void;
  readonly onSubmit: () => void;
}

function IdentityStep(props: IdentityStepProps) {
  const [focusIndex, setFocusIndex] = createSignal(0);
  const FIELD_COUNT = 4;

  useKeyboard((key) => {
    if (key.name === "tab") {
      const delta = key.shift ? -1 : 1;
      setFocusIndex((current) => (current + delta + FIELD_COUNT) % FIELD_COUNT);
    }
  });

  function field(
    index: number,
    label: string,
    placeholder: string,
    value: string,
    onChange: (next: string) => void,
    onSubmit?: () => void
  ) {
    const focused = () => focusIndex() === index;
    return (
      <box flexDirection="row" alignItems="center" marginBottom={1}>
        <box width={12} flexShrink={0}>
          <text fg={focused() ? props.theme.brandShimmer : props.theme.text}>
            {`${focused() ? "›" : " "} ${label}`}
          </text>
        </box>
        <box
          flexGrow={1}
          border
          borderColor={focused() ? props.theme.brandShimmer : props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            value={value}
            placeholder={placeholder}
            focused={focused()}
            onInput={onChange}
            {...(onSubmit === undefined ? {} : { onSubmit })}
          />
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Provider connection
      </text>
      <text fg={props.theme.hintText}>
        Edit the ID, name, base URL, and (optional) API key. Use Tab to move
        between fields.
      </text>

      <box marginTop={1} flexDirection="column">
        {field(0, "ID", "openai", props.draft.id, (next) => props.onUpdate({ id: next }))}
        {field(1, "Name", "OpenAI", props.draft.name, (next) => props.onUpdate({ name: next }))}
        {field(2, "Base URL", "https://api.openai.com/v1", props.draft.baseUrl, (next) =>
          props.onUpdate({ baseUrl: next })
        )}
        {field(
          3,
          "API key",
          "leave blank if not required",
          props.draft.apiKey,
          (next) => props.onUpdate({ apiKey: next }),
          () => props.onSubmit()
        )}
      </box>

      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
        Tip: press Enter on the API key field to continue.
      </text>
    </box>
  );
}

interface ModelsModeStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly onSelect: (mode: "fetch" | "manual") => void;
}

function ModelsModeStep(props: ModelsModeStepProps) {
  const options = [
    {
      name: "Fetch from /models",
      description: "Ask the provider which models are available right now",
      value: "fetch"
    },
    {
      name: "Enter model IDs manually",
      description: "Type a comma-separated list of model IDs to use",
      value: "manual"
    }
  ] as const;

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        How should models be added?
      </text>
      <text fg={props.theme.hintText}>
        Recode can call {`${props.draft.baseUrl.trim() === "" ? "<base URL>" : props.draft.baseUrl}`}/models
        for you, or you can list IDs by hand.
      </text>
      <box marginTop={1}>
        <select
          height={Math.min(6, options.length * 2 + 1)}
          options={options.map((option) => ({ ...option }))}
          focused
          onSelect={(_index, option) => {
            if (option !== null && typeof option.value === "string") {
              props.onSelect(option.value as "fetch" | "manual");
            }
          }}
        />
      </box>
    </box>
  );
}

interface FetchingStepProps {
  readonly theme: ThemeColors;
  readonly message: string;
}

function FetchingStep(props: FetchingStepProps) {
  return (
    <box flexDirection="column">
      <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>
        Fetching models...
      </text>
      <text fg={props.theme.hintText}>{props.message}</text>
    </box>
  );
}

interface ModelsSelectStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly status: string | undefined;
  readonly onPick: (modelId: string) => void;
}

function ModelsSelectStep(props: ModelsSelectStepProps) {
  const options = createMemo(() => [
    ...props.draft.models.slice(0, 40).map((model) => ({
      name: model.id,
      description: model.label ?? "",
      value: model.id
    })),
    {
      name: "Use a different model ID",
      description: "Type a custom model ID",
      value: CUSTOM_MODEL_ID
    }
  ]);

  const initialIndex = createMemo(() => {
    const wanted = props.draft.defaultModelId;
    const idx = options().findIndex((option) => option.value === wanted);
    return idx >= 0 ? idx : 0;
  });

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Select the default model
      </text>
      <Show when={props.status !== undefined}>
        <text fg={props.theme.success}>{props.status}</text>
      </Show>
      <text fg={props.theme.hintText}>
        This will be saved as the provider's default model. You can pick a
        different model at runtime later.
      </text>
      <box marginTop={1}>
        <select
          height={Math.min(14, options().length * 2 + 1)}
          options={options()}
          selectedIndex={initialIndex()}
          focused
          onSelect={(_index, option) => {
            if (option !== null && typeof option.value === "string") {
              props.onPick(option.value);
            }
          }}
        />
      </box>
    </box>
  );
}

interface ModelsManualStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly error: string | undefined;
  readonly status: string | undefined;
  readonly onUpdate: (patch: Partial<ProviderDraft>) => void;
  readonly onSubmit: (modelIds: string, defaultModelId: string) => void;
}

function ModelsManualStep(props: ModelsManualStepProps) {
  const initialIds = props.draft.models.map((model) => model.id).join(", ");
  const [idsText, setIdsText] = createSignal(initialIds);
  const [defaultId, setDefaultId] = createSignal(
    props.draft.defaultModelId === "" ? props.draft.models[0]?.id ?? "" : props.draft.defaultModelId
  );
  const [focusIndex, setFocusIndex] = createSignal(0);
  const FIELD_COUNT = 2;

  useKeyboard((key) => {
    if (key.name === "tab") {
      const delta = key.shift ? -1 : 1;
      setFocusIndex((current) => (current + delta + FIELD_COUNT) % FIELD_COUNT);
    }
  });

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Enter model IDs manually
      </text>
      <Show when={props.status !== undefined}>
        <text fg={props.theme.warning}>{props.status}</text>
      </Show>
      <text fg={props.theme.hintText}>
        Type a comma-separated list, then choose which one is the default.
      </text>

      <box flexDirection="row" alignItems="center" marginTop={1} marginBottom={1}>
        <box width={14} flexShrink={0}>
          <text fg={focusIndex() === 0 ? props.theme.brandShimmer : props.theme.text}>
            {`${focusIndex() === 0 ? "›" : " "} Model IDs`}
          </text>
        </box>
        <box
          flexGrow={1}
          border
          borderColor={focusIndex() === 0 ? props.theme.brandShimmer : props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            value={idsText()}
            placeholder="gpt-4o, gpt-4o-mini"
            focused={focusIndex() === 0}
            onInput={(next) => {
              setIdsText(next);
              const first = next.split(",").map((value) => value.trim()).find((value) => value !== "");
              if (defaultId() === "" && first !== undefined) {
                setDefaultId(first);
              }
            }}
          />
        </box>
      </box>

      <box flexDirection="row" alignItems="center" marginBottom={1}>
        <box width={14} flexShrink={0}>
          <text fg={focusIndex() === 1 ? props.theme.brandShimmer : props.theme.text}>
            {`${focusIndex() === 1 ? "›" : " "} Default`}
          </text>
        </box>
        <box
          flexGrow={1}
          border
          borderColor={focusIndex() === 1 ? props.theme.brandShimmer : props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            value={defaultId()}
            placeholder="gpt-4o"
            focused={focusIndex() === 1}
            onInput={setDefaultId}
            onSubmit={() => props.onSubmit(idsText(), defaultId())}
          />
        </box>
      </box>

      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
        Tip: press Enter on the Default field to continue.
      </text>
    </box>
  );
}

interface AdvancedAskStepProps {
  readonly theme: ThemeColors;
  readonly onSelect: (answer: "configure" | "skip") => void;
}

function AdvancedAskStep(props: AdvancedAskStepProps) {
  const options = [
    {
      name: "Skip advanced settings",
      description: "Use provider defaults for tokens, temperature, headers, etc.",
      value: "skip"
    },
    {
      name: "Configure advanced settings",
      description: "Edit max output tokens, temperature, tool choice, headers, options, context window",
      value: "configure"
    }
  ] as const;

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Tuning
      </text>
      <text fg={props.theme.hintText}>
        Want to fine-tune request parameters or attach extra HTTP headers? You
        can always come back later via `recode setup` or by editing the config
        file directly.
      </text>
      <box marginTop={1}>
        <select
          height={Math.min(6, options.length * 2 + 1)}
          options={options.map((option) => ({ ...option }))}
          focused
          onSelect={(_index, option) => {
            if (option !== null && typeof option.value === "string") {
              props.onSelect(option.value as "configure" | "skip");
            }
          }}
        />
      </box>
    </box>
  );
}

interface AdvancedStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly error: string | undefined;
  readonly onUpdate: (patch: Partial<ProviderDraft>) => void;
  readonly onCycleToolChoice: () => void;
  readonly onSubmit: () => void;
}

function AdvancedStep(props: AdvancedStepProps) {
  const [focusIndex, setFocusIndex] = createSignal(0);
  const FIELD_COUNT = 6;

  useKeyboard((key) => {
    if (key.name === "tab") {
      const delta = key.shift ? -1 : 1;
      setFocusIndex((current) => (current + delta + FIELD_COUNT) % FIELD_COUNT);
      return;
    }
    if (key.name === "space" && focusIndex() === 2) {
      props.onCycleToolChoice();
    }
  });

  function inputField(
    index: number,
    label: string,
    placeholder: string,
    value: string,
    onChange: (next: string) => void,
    onSubmit?: () => void
  ) {
    const focused = () => focusIndex() === index;
    return (
      <box flexDirection="row" alignItems="center" marginBottom={1}>
        <box width={18} flexShrink={0}>
          <text fg={focused() ? props.theme.brandShimmer : props.theme.text}>
            {`${focused() ? "›" : " "} ${label}`}
          </text>
        </box>
        <box
          flexGrow={1}
          border
          borderColor={focused() ? props.theme.brandShimmer : props.theme.promptBorder}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            value={value}
            placeholder={placeholder}
            focused={focused()}
            onInput={onChange}
            {...(onSubmit === undefined ? {} : { onSubmit })}
          />
        </box>
      </box>
    );
  }

  const toolChoiceFocused = () => focusIndex() === 2;

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Advanced settings
      </text>
      <text fg={props.theme.hintText}>
        Leave any field blank to use the provider's default. JSON fields must
        parse as objects.
      </text>

      <box marginTop={1} flexDirection="column">
        {inputField(
          0,
          "Max output tokens",
          "e.g. 4096",
          props.draft.maxOutputTokens,
          (next) => props.onUpdate({ maxOutputTokens: next })
        )}
        {inputField(
          1,
          "Temperature",
          "e.g. 0.7",
          props.draft.temperature,
          (next) => props.onUpdate({ temperature: next })
        )}

        <box flexDirection="row" alignItems="center" marginBottom={1}>
          <box width={18} flexShrink={0}>
            <text fg={toolChoiceFocused() ? props.theme.brandShimmer : props.theme.text}>
              {`${toolChoiceFocused() ? "›" : " "} Tool choice`}
            </text>
          </box>
          <box
            flexGrow={1}
            border
            borderColor={toolChoiceFocused() ? props.theme.brandShimmer : props.theme.promptBorder}
            paddingLeft={1}
            paddingRight={1}
          >
            <text
              fg={toolChoiceFocused() ? props.theme.brandShimmer : props.theme.text}
              attributes={toolChoiceFocused() ? TextAttributes.BOLD : TextAttributes.NONE}
            >
              {toolChoiceLabel(props.draft.toolChoice)}
            </text>
          </box>
        </box>

        {inputField(
          3,
          "Context window",
          `tokens for ${props.draft.defaultModelId || "default model"}`,
          props.draft.contextWindow,
          (next) => props.onUpdate({ contextWindow: next })
        )}
        {inputField(
          4,
          "Headers JSON",
          `{"X-Org": "acme"}`,
          props.draft.headersJson,
          (next) => props.onUpdate({ headersJson: next })
        )}
        {inputField(
          5,
          "Options JSON",
          `{"timeoutMs": 60000}`,
          props.draft.optionsJson,
          (next) => props.onUpdate({ optionsJson: next }),
          () => props.onSubmit()
        )}
      </box>

      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
        Tip: press Space on Tool choice to cycle, Enter on Options JSON to continue.
      </text>
    </box>
  );
}

interface ReviewStepProps {
  readonly theme: ThemeColors;
  readonly draft: ProviderDraft;
  readonly error: string | undefined;
  readonly onToggleActive: () => void;
  readonly onSave: () => void;
  readonly onBack: () => void;
}

function ReviewStep(props: ReviewStepProps) {
  const options = createMemo(() => [
    {
      name: props.draft.makeActive
        ? "Set as active: ON  (space toggles)"
        : "Set as active: OFF (space toggles)",
      description: "Use this provider for the next CLI/TUI session",
      value: "toggle"
    },
    {
      name: "Save provider",
      description: "Write the configuration to disk",
      value: "save"
    },
    {
      name: "Back to advanced settings",
      description: "Tweak tuning parameters before saving",
      value: "back"
    }
  ]);

  useKeyboard((key) => {
    if (key.name === "space") {
      props.onToggleActive();
    }
  });

  return (
    <box flexDirection="column">
      <text fg={props.theme.text} attributes={TextAttributes.BOLD}>
        Review
      </text>
      <text fg={props.theme.hintText}>
        Double-check the values below. Press Enter on "Save provider" to write
        them to your global config.
      </text>

      <box
        marginTop={1}
        flexDirection="column"
        border
        borderColor={props.theme.promptBorder}
        paddingLeft={1}
        paddingRight={1}
      >
        <SummaryLine theme={props.theme} label="Kind" value={props.draft.kind} />
        <SummaryLine theme={props.theme} label="ID" value={props.draft.id} />
        <SummaryLine theme={props.theme} label="Name" value={props.draft.name} />
        <SummaryLine theme={props.theme} label="Base URL" value={props.draft.baseUrl} />
        <SummaryLine
          theme={props.theme}
          label="API key"
          value={props.draft.apiKey === "" ? "(none)" : maskApiKey(props.draft.apiKey)}
        />
        <SummaryLine
          theme={props.theme}
          label="Default model"
          value={props.draft.defaultModelId}
        />
        <SummaryLine
          theme={props.theme}
          label="Models"
          value={
            props.draft.models.length === 0
              ? "(none)"
              : `${props.draft.models.length} configured`
          }
        />
        <SummaryLine
          theme={props.theme}
          label="Max tokens"
          value={props.draft.maxOutputTokens === "" ? "default" : props.draft.maxOutputTokens}
        />
        <SummaryLine
          theme={props.theme}
          label="Temperature"
          value={props.draft.temperature === "" ? "default" : props.draft.temperature}
        />
        <SummaryLine
          theme={props.theme}
          label="Tool choice"
          value={toolChoiceLabel(props.draft.toolChoice)}
        />
        <SummaryLine
          theme={props.theme}
          label="Context window"
          value={props.draft.contextWindow === "" ? "unset" : props.draft.contextWindow}
        />
        <SummaryLine
          theme={props.theme}
          label="Headers"
          value={props.draft.headersJson === "" ? "(none)" : "custom"}
        />
        <SummaryLine
          theme={props.theme}
          label="Options"
          value={props.draft.optionsJson === "" ? "(none)" : "custom"}
        />
      </box>

      <Show when={props.error !== undefined}>
        <text fg={props.theme.error} marginTop={1}>{props.error}</text>
      </Show>

      <box marginTop={1}>
        <select
          height={Math.min(8, options().length * 2 + 1)}
          options={options()}
          focused
          onSelect={(_index, option) => {
            if (option === null) {
              return;
            }
            if (option.value === "save") {
              props.onSave();
              return;
            }
            if (option.value === "back") {
              props.onBack();
              return;
            }
            if (option.value === "toggle") {
              props.onToggleActive();
            }
          }}
        />
      </box>
    </box>
  );
}

interface SavedStepProps {
  readonly theme: ThemeColors;
  readonly configPath: string;
  readonly draft: ProviderDraft;
  readonly status: string | undefined;
  readonly onAddAnother: () => void;
  readonly onExit: () => void;
}

function SavedStep(props: SavedStepProps) {
  const options = [
    {
      name: "Add another provider",
      description: "Configure a different backend",
      value: "another"
    },
    { name: "Finish and exit", description: "Close the wizard", value: "exit" }
  ] as const;

  return (
    <box flexDirection="column">
      <text fg={props.theme.success} attributes={TextAttributes.BOLD}>
        ✓ Provider saved
      </text>
      <Show when={props.status !== undefined}>
        <text fg={props.theme.hintText}>{props.status}</text>
      </Show>
      <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
        {`Wrote to ${props.configPath}.`}
      </text>

      <box
        marginTop={1}
        border
        borderColor={props.theme.promptBorder}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <text fg={props.theme.text}>
          {`${props.draft.name} (${props.draft.id}) → ${props.draft.defaultModelId}`}
        </text>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
          {props.draft.baseUrl}
        </text>
      </box>

      <box marginTop={1}>
        <select
          height={Math.min(5, options.length * 2 + 1)}
          options={options.map((option) => ({ ...option }))}
          focused
          onSelect={(_index, option) => {
            if (option === null) {
              return;
            }
            if (option.value === "another") {
              props.onAddAnother();
              return;
            }
            if (option.value === "exit") {
              props.onExit();
            }
          }}
        />
      </box>
    </box>
  );
}

interface SummaryLineProps {
  readonly theme: ThemeColors;
  readonly label: string;
  readonly value: string;
}

function SummaryLine(props: SummaryLineProps) {
  return (
    <box flexDirection="row">
      <box width={16} flexShrink={0}>
        <text fg={props.theme.hintText}>{props.label}</text>
      </box>
      <text fg={props.theme.text}>{props.value}</text>
    </box>
  );
}

function toolChoiceLabel(choice: ProviderDraft["toolChoice"]): string {
  switch (choice) {
    case "default":
      return "Provider default";
    case "auto":
      return "Auto";
    case "required":
      return "Required";
  }
}

function maskApiKey(value: string): string {
  if (value.length <= 6) {
    return "***";
  }
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}

function blankDraft(config: RecodeConfigFile): ProviderDraft {
  const kind: ProviderKind = "openai";
  return {
    editingExistingId: undefined,
    kind,
    id: suggestNewProviderId(config, kind),
    name: getDefaultProviderName(kind),
    baseUrl: getDefaultProviderBaseUrl(kind),
    apiKey: "",
    models: [],
    defaultModelId: "",
    contextWindow: "",
    maxOutputTokens: "",
    temperature: "",
    toolChoice: "default",
    headersJson: "",
    optionsJson: "",
    makeActive: config.providers.length === 0
  };
}

function draftFromExisting(provider: ConfiguredProvider, isActive: boolean): ProviderDraft {
  return {
    editingExistingId: provider.id,
    kind: provider.kind,
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey ?? "",
    models: provider.models,
    defaultModelId: provider.defaultModelId ?? provider.models[0]?.id ?? "",
    contextWindow:
      provider.models.find((model) => model.id === provider.defaultModelId)?.contextWindowTokens?.toString() ?? "",
    maxOutputTokens: provider.maxOutputTokens === undefined ? "" : provider.maxOutputTokens.toString(),
    temperature: provider.temperature === undefined ? "" : provider.temperature.toString(),
    toolChoice: provider.toolChoice ?? "default",
    headersJson: provider.headers === undefined ? "" : JSON.stringify(provider.headers),
    optionsJson: provider.options === undefined ? "" : JSON.stringify(provider.options),
    makeActive: isActive
  };
}

function parseManualModels(value: string): readonly ConfiguredModel[] {
  if (value.trim() === "") {
    return [];
  }
  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  return ids.map((id) => ({ id }));
}

function ensureDefaultModel(
  models: readonly ConfiguredModel[],
  defaultModelId: string,
  contextWindow?: number
): readonly ConfiguredModel[] {
  const list = models.some((model) => model.id === defaultModelId)
    ? models
    : [...models, { id: defaultModelId }];

  if (contextWindow === undefined) {
    return list;
  }

  return list.map((model) =>
    model.id === defaultModelId ? { ...model, contextWindowTokens: contextWindow } : model
  );
}

function mergeModelsPreservingMetadata(
  existing: readonly ConfiguredModel[],
  next: readonly ConfiguredModel[]
): readonly ConfiguredModel[] {
  const merged = new Map<string, ConfiguredModel>();
  for (const model of existing) {
    merged.set(model.id, model);
  }
  for (const model of next) {
    const existingEntry = merged.get(model.id);
    merged.set(model.id, {
      ...(existingEntry ?? {}),
      ...model,
      ...(existingEntry?.contextWindowTokens === undefined
        ? {}
        : { contextWindowTokens: existingEntry.contextWindowTokens })
    });
  }
  return [...merged.values()];
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function suggestNewProviderId(config: RecodeConfigFile, kind: ProviderKind): string {
  const baseId = kind;
  if (!config.providers.some((provider) => provider.id === baseId)) {
    return baseId;
  }
  let index = 2;
  while (config.providers.some((provider) => provider.id === `${baseId}-${index}`)) {
    index += 1;
  }
  return `${baseId}-${index}`;
}

function parsePositiveInt(value: string): number | undefined | "error" {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "error";
  }
  return parsed;
}

function parseNumber(value: string): number | undefined | "error" {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return "error";
  }
  return parsed;
}

function parseOptionalStringRecord(
  value: string
): Readonly<Record<string, string>> | undefined | "error" {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isJsonObject(parsed)) {
      return "error";
    }
    const record: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val !== "string") {
        return "error";
      }
      record[key] = val;
    }
    return record;
  } catch {
    return "error";
  }
}

function parseOptionalJsonObject(value: string): JsonObject | undefined | "error" {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isJsonObject(parsed) ? parsed : "error";
  } catch {
    return "error";
  }
}

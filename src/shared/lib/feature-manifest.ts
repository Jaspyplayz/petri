export type RiskLevel = "low" | "medium" | "high";

export type FlowStep<SelectorName extends string> =
  | { readonly action: "goto"; readonly path: string }
  | { readonly action: "click"; readonly target: SelectorName }
  | { readonly action: "fill"; readonly target: SelectorName; readonly value: string }
  | { readonly action: "press"; readonly target: SelectorName; readonly key: string }
  | { readonly action: "expectVisible"; readonly target: SelectorName }
  | { readonly action: "expectText"; readonly target: SelectorName; readonly text: string }
  | { readonly action: "expectStyle"; readonly target: SelectorName; readonly property: string; readonly value: string }
  | { readonly action: "pauseAnimations"; readonly atMs: number }
  | { readonly action: "screenshot"; readonly name: string }
  | { readonly action: "wait"; readonly ms: number };

export type Flow<SelectorName extends string> = {
  readonly description: string;
  readonly writes?: true;
  readonly steps: readonly FlowStep<SelectorName>[];
};

export type KeyboardShortcut = {
  readonly keys: string;
  readonly description: string;
};

export type FeatureManifest<SelectorName extends string = string> = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly routes: readonly string[];
  readonly uiLocation: string;
  readonly howToReach: readonly string[];
  readonly keyboardShortcuts: readonly KeyboardShortcut[];
  readonly selectors: Readonly<Record<SelectorName, string>>;
  readonly flows: Readonly<Record<string, Flow<NoInfer<SelectorName>>>>;
  readonly dataTables: readonly string[];
  readonly owners: "agents";
  readonly riskLevel: RiskLevel;
};

export function defineFeature<const SelectorName extends string>(
  manifest: FeatureManifest<SelectorName>,
): FeatureManifest<SelectorName> {
  return manifest;
}

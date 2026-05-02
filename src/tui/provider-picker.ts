/**
 * Provider picker helpers for the TUI.
 */

import type { RuntimeConfig, RuntimeProviderConfig } from "../runtime/runtime-config.ts";

/**
 * One selectable provider row in the provider picker.
 */
export interface ProviderPickerItem {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerKind: string;
  readonly baseUrl: string;
  readonly defaultModelId?: string;
  readonly active: boolean;
  readonly disabled: boolean;
}

/**
 * Build provider picker rows from runtime config.
 */
export function buildProviderPickerItems(runtimeConfig: RuntimeConfig): readonly ProviderPickerItem[] {
  return runtimeConfig.providers.map((provider) => toProviderPickerItem(provider, runtimeConfig));
}

/**
 * Return the index of the active provider row.
 */
export function findActiveProviderPickerItemIndex(items: readonly ProviderPickerItem[]): number {
  const activeIndex = items.findIndex((item) => item.active);
  return activeIndex === -1 ? 0 : activeIndex;
}

/**
 * Return the provider's configured default model, if any.
 */
export function getProviderDefaultModelId(provider: RuntimeProviderConfig): string | undefined {
  return provider.defaultModelId ?? provider.models[0]?.id;
}

function toProviderPickerItem(
  provider: RuntimeProviderConfig,
  runtimeConfig: RuntimeConfig
): ProviderPickerItem {
  const defaultModelId = getProviderDefaultModelId(provider);

  return {
    providerId: provider.id,
    providerName: provider.name,
    providerKind: provider.kind,
    baseUrl: provider.baseUrl,
    active: provider.id === runtimeConfig.providerId,
    disabled: provider.disabled === true,
    ...(defaultModelId === undefined ? {} : { defaultModelId })
  };
}

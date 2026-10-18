"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";
import Modal from "./Modal";
import ProviderIcon from "./ProviderIcon";
import CapacityBadges from "./CapacityBadges";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias } from "@/shared/constants/providers";
import { parseSearchQuery, matchesSearch } from "@/shared/utils/modelSearchFilter";
import { getDeactivatedProviderIds } from "@/shared/utils/connectionStatus";

// Provider order: OAuth first, then Free Tier, then API Key (matches dashboard/providers)
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

// Providers that need no auth — always show in model selector
const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter(id => FREE_PROVIDERS[id].noAuth);

// Providers with per-account live catalogs via /api/providers/[id]/models.
// Static registry stays as fallback when live fetch fails or is empty.
// zed added in #4244: its backend customResolver already returns live models
// but the frontend omitted it, hiding Zed entirely from the Combo picker.
const LIVE_CATALOG_PROVIDERS = ["cursor", "cline", "clinepass", "zed"];

// Fetch a provider's account-scoped catalog for every active connection and merge
// the results. Entries collapse by model id on purpose: two connections of the
// same provider produce the same picker value (`alias/id`), so keeping the first
// avoids duplicate rows. There is no per-connection metadata to preserve beyond
// {id,name}. Empty array means "nothing live" so callers keep the static fallback.
function useLiveProviderModels(isOpen, connectionIds, label) {
  const [models, setModels] = useState([]);
  const idsKey = (connectionIds ?? []).join("|");

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    if (!isOpen || ids.length === 0) {
      setModels([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all(ids.map(async (connectionId) => {
      const response = await fetch(`/api/providers/${connectionId}/models`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    }))
      .then((modelLists) => {
        if (cancelled) return;
        const seen = new Set();
        setModels(modelLists.flat().filter((model) => {
          if (!model?.id || seen.has(model.id)) return false;
          seen.add(model.id);
          return true;
        }));
      })
      .catch((error) => {
        // Do not hide the static fallback when the account catalog is unavailable.
        console.warn(`Unable to load ${label} models for selector:`, error);
        if (!cancelled) setModels([]);
      });

    return () => { cancelled = true; };
  }, [isOpen, idsKey, label]);

  return models;
}

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  onDeselect,
  onSelectBatch,
  onDeselectBatch,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  size = "lg",
  modelAliases = {},
  kindFilter = null,
  capFilter = null,
  addedModelValues = [],
  closeOnSelect = true,
  allowProviderWildcard = false,
}) {
  // Live-fetched connections on modal open, fallback to activeProviders prop
  const [fetchedConnections, setFetchedConnections] = useState(null);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
      const data = await res.json();
      setFetchedConnections(data.connections || []);
    } catch (error) {
      console.error("Error fetching providers in ModelSelectModal:", error);
      setFetchedConnections([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchConnections();
  }, [isOpen]);

  const effectiveConnections = useMemo(() => {
    return fetchedConnections !== null ? fetchedConnections : (activeProviders || []);
  }, [fetchedConnections, activeProviders]);

  // Filter effectiveConnections by active state and serviceKinds when kindFilter set (e.g. "webSearch", "webFetch")
  const filteredActiveProviders = useMemo(() => {
    const activeOnly = effectiveConnections.filter((p) => p && p.isActive !== false);
    if (!kindFilter) return activeOnly;
    return activeOnly.filter((p) => {
      const info = AI_PROVIDERS[p.provider];
      const kinds = info?.serviceKinds || ["llm"];
      return kinds.includes(kindFilter);
    });
  }, [effectiveConnections, kindFilter]);

  // Set of provider IDs that have connections configured, but ALL of them are deactivated (isActive === false)
  const deactivatedProviderIds = useMemo(() => {
    return getDeactivatedProviderIds(effectiveConnections);
  }, [effectiveConnections]);

  const { getCaps } = useModelCaps();
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState({});
  const [expandedProviders, setExpandedProviders] = useState({});
  const [combosExpanded, setCombosExpanded] = useState(true);
  // Cursor and Cline expose the usable catalog per account, so the static catalog is
  // kept only as a fallback: it goes stale quickly and entitlements differ per account.
  // Single map driven by LIVE_CATALOG_PROVIDERS so the constant cannot drift
  // from the memos below; per-provider arrays stay referentially stable unless
  // activeProviders itself changes.
  const liveConnectionIdsByProvider = useMemo(() => {
    const map = Object.fromEntries(LIVE_CATALOG_PROVIDERS.map((id) => [id, []]));
    for (const p of filteredActiveProviders) {
      if (p?.id && Object.prototype.hasOwnProperty.call(map, p.provider)) map[p.provider].push(p.id);
    }
    return map;
  }, [filteredActiveProviders]);
  const cursorConnectionIds = liveConnectionIdsByProvider.cursor;
  const clineConnectionIds = liveConnectionIdsByProvider.cline;
  const clinepassConnectionIds = liveConnectionIdsByProvider.clinepass;
  const zedConnectionIds = liveConnectionIdsByProvider.zed;

  const cursorModels = useLiveProviderModels(isOpen, cursorConnectionIds, "Cursor");
  const clineModels = useLiveProviderModels(isOpen, clineConnectionIds, "Cline");
  const clinepassModels = useLiveProviderModels(isOpen, clinepassConnectionIds, "ClinePass");
  const zedModels = useLiveProviderModels(isOpen, zedConnectionIds, "Zed");

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
      const data = await res.json();
      setCombos(data.combos || []);
    } catch (error) {
      console.error("Error fetching combos:", error);
      setCombos([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCombos();
  }, [isOpen]);

  const fetchProviderNodes = async () => {
    try {
      const res = await fetch("/api/provider-nodes");
      if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
      const data = await res.json();
      setProviderNodes(data.nodes || []);
    } catch (error) {
      console.error("Error fetching provider nodes:", error);
      setProviderNodes([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchProviderNodes();
  }, [isOpen]);

  const fetchCustomModels = async () => {
    try {
      const res = await fetch("/api/models/custom");
      if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
      const data = await res.json();
      setCustomModels(data.models || []);
    } catch (error) {
      console.error("Error fetching custom models:", error);
      setCustomModels([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCustomModels();
  }, [isOpen]);

  const fetchDisabledModels = async () => {
    try {
      const res = await fetch("/api/models/disabled");
      if (!res.ok) throw new Error(`Failed to fetch disabled models: ${res.status}`);
      const data = await res.json();
      setDisabledModels(data.disabled || {});
    } catch (error) {
      console.error("Error fetching disabled models:", error);
      setDisabledModels({});
    }
  };

  useEffect(() => {
    if (isOpen) fetchDisabledModels();
  }, [isOpen]);

  const allProviders = useMemo(() => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS }), []);

  // Group models by provider with priority order
  const groupedModels = useMemo(() => {
    const groups = {};

    // Kinds where the provider IS the model (no per-model selection needed)
    const PROVIDER_AS_MODEL_KINDS = new Set(["webSearch", "webFetch"]);
    // Kinds that map directly to model.type field
    const TYPED_KINDS = new Set(["image", "tts", "stt", "embedding", "imageToText"]);
    // For these kinds, providers without hardcoded models can still be picked (provider-as-model fallback)
    const ALLOW_PROVIDER_FALLBACK_KINDS = new Set(["tts", "image", "webFetch"]);

    // Filter a models[] array by kindFilter (keep only matching kind)
    const filterByKind = (models) => {
      // No kindFilter means the LLM selector. Keep custom models visible because
      // user-added models may have typed capabilities (for example imageToText)
      // while still being valid chat/combo targets.
      if (!kindFilter) return models.filter((m) => m.isPlaceholder || m.isCustom || !getModelKind(m) || getModelKind(m) === "llm");
      if (!TYPED_KINDS.has(kindFilter)) return models;
      return models.filter((m) => m.isPlaceholder || getModelKind(m) === kindFilter);
    };

    // Get all active provider IDs from connections (filtered by kindFilter if set)
    const activeConnectionIds = filteredActiveProviders.map(p => p.provider);

    // No-auth providers: filter by kindFilter as well
    const noAuthIds = (kindFilter
      ? NO_AUTH_PROVIDER_IDS.filter((id) => (AI_PROVIDERS[id]?.serviceKinds || ["llm"]).includes(kindFilter))
      : NO_AUTH_PROVIDER_IDS).filter((id) => !deactivatedProviderIds.has(id));

    // Compatible nodes (OpenAI/Anthropic Compatible) that already have user-added
    // custom models should be selectable even without an API-key connection. Local /
    // self-hosted endpoints (Ollama, internal relays, etc.) don't always need a stored
    // key, so gating on connections hides models the user already added. These nodes
    // are LLM-only, so only surface them when no kind filter is active.
    // See #4177, #2113, #2119, #1988.
    const existingNodeIds = new Set((providerNodes || []).map((n) => n?.id).filter(Boolean));
    const compatibleNodeIds = kindFilter
      ? []
      : customModels
          .map((m) => m.providerAlias)
          .filter((alias) =>
            (isOpenAICompatibleProvider(alias) || isAnthropicCompatibleProvider(alias)) &&
            existingNodeIds.has(alias) &&
            !deactivatedProviderIds.has(alias)
          );

    // Only show connected providers (including both standard and custom)
    const providerIdsToShow = new Set([
      ...activeConnectionIds,  // Only connected providers
      ...noAuthIds,            // No-auth providers (kind-filtered)
      ...compatibleNodeIds,    // Compatible nodes with user-added models
    ].filter((id) => !deactivatedProviderIds.has(id)));

    // Sort by PROVIDER_ORDER
    const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
      const indexA = PROVIDER_ORDER.indexOf(a);
      const indexB = PROVIDER_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    sortedProviderIds.forEach((providerId) => {
      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

      // For provider-as-model kinds (webSearch/webFetch): emit a single entry where value === providerId
      if (kindFilter && PROVIDER_AS_MODEL_KINDS.has(kindFilter)) {
        groups[providerId] = {
          name: providerInfo.name,
          alias,
          color: providerInfo.color,
          models: [{ id: providerId, name: providerInfo.name, value: providerId }],
        };
        return;
      }

      if (providerInfo.passthroughModels) {
        const aliasModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${alias}/`, ""),
            name: aliasName,
            value: fullModel,
          }));
        const customRegisteredModels = customModels
          .filter((m) => m.providerAlias === alias)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${alias}/${m.id}`,
            kind: getModelKind(m),
            isCustom: true,
          }));

        // For typed kinds, only include hardcoded typed models (aliases are typically LLM-only and lack type info)
        let combined = aliasModels;
        if (kindFilter && TYPED_KINDS.has(kindFilter)) {
          const registeredTyped = customRegisteredModels.filter((m) => getModelKind(m) === kindFilter);
          combined = [
            ...registeredTyped,
            ...getModelsByProviderId(providerId)
            .filter((m) => getModelKind(m) === kindFilter)
            .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
            .filter((m) => !registeredTyped.some((registered) => registered.value === m.value)),
          ];
          // Fallback: provider-as-model when no hardcoded models match (tts/image/webFetch only)
          if (combined.length === 0 && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
            const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
            if (supports) combined = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        } else {
          // LLM/null kind: merge hardcoded models (e.g. mimo-free → mimo-auto) with user-added models
          const registeredLlms = customRegisteredModels.filter((m) => !getModelKind(m) || getModelKind(m) === "llm");
          const seen = new Set([...aliasModels, ...registeredLlms].map((m) => m.value));
          const hardcoded = getModelsByProviderId(providerId)
            .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
            .map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) }))
            .filter((m) => !seen.has(m.value));
          combined = [...registeredLlms, ...aliasModels.filter((m) => !registeredLlms.some((registered) => registered.value === m.value)), ...hardcoded];
        }

        if (combined.length > 0) {
          // Check for custom name from providerNodes (for compatible providers)
          const matchedNode = providerNodes.find(node => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: combined,
          };
        }
      } else if (isCustomProvider) {
        // Custom (openai/anthropic-compatible) providers are LLM-only — skip for typed media kinds
        if (kindFilter && TYPED_KINDS.has(kindFilter)) return;
        // Find connection object to get prefix synchronously without waiting for providerNodes fetch
        const connection = filteredActiveProviders.find(p => p.provider === providerId) || effectiveConnections.find(p => p.provider === providerId);
        const matchedNode = providerNodes.find(node => node.id === providerId);
        const displayName = matchedNode?.name || connection?.name || providerInfo.name;
        const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

        // Aliases are stored using the raw providerId as key (e.g. "openai-compatible-chat-<uuid>/glm-4.7"),
        // so we must filter by providerId, not by the display prefix.
        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          }));

        // Merge custom models registered via /api/models/custom for this provider
        // providerAlias in DB uses the raw providerId, not the display prefix
        const registeredCustom = customModels
          .filter((m) => m.providerAlias === providerId)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${nodePrefix}/${m.id}`,
            isCustom: true,
          }));
        const seen = new Set(nodeModels.map((m) => m.value));
        const mergedModels = [...nodeModels, ...registeredCustom.filter((m) => !seen.has(m.value))];

        // Always show compatible providers that are connected, even with no aliases.
        // When no aliases exist, show a placeholder so users know it's available.
        const modelsToShow = mergedModels.length > 0 ? mergedModels : [{
          id: `__placeholder__${providerId}`,
          name: `${nodePrefix}/model-id`,
          value: `${nodePrefix}/model-id`,
          isPlaceholder: true,
        }];

        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: modelsToShow,
          isCustom: true,
          hasModels: mergedModels.length > 0,
        };
      } else {
        const liveModels = providerId === "cursor" ? cursorModels : providerId === "cline" ? clineModels : providerId === "clinepass" ? clinepassModels : providerId === "zed" ? zedModels : [];
        const hardcodedModels = liveModels.length > 0
          ? liveModels
          : getModelsByProviderId(providerId);
        const hardcodedIds = new Set(hardcodedModels.map((m) => m.id));

        // Custom models: if no hardcoded models (e.g. openrouter), show all aliases for this provider
        // Otherwise only show aliases where aliasName === modelId ("Add Model" button pattern)
        const hasHardcoded = hardcodedModels.length > 0;
        const customAliasModels = Object.entries(modelAliases)
          .filter(([aliasName, fullModel]) =>
            fullModel.startsWith(`${alias}/`) &&
            (hasHardcoded ? aliasName === fullModel.replace(`${alias}/`, "") : true) &&
            !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
          )
          .map(([aliasName, fullModel]) => {
            const modelId = fullModel.replace(`${alias}/`, "");
            return { id: modelId, name: aliasName, value: fullModel, isCustom: true };
          });

        // Custom models registered via /api/models/custom (provider "Add Model" button)
        const customAliasIds = new Set(customAliasModels.map((m) => m.id));
        const customRegisteredModels = customModels
          .filter((m) => m.providerAlias === alias && !hardcodedIds.has(m.id) && !customAliasIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.name || m.id, value: `${alias}/${m.id}`, isCustom: true }));

        const merged = [
          ...hardcodedModels.map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}`, kind: getModelKind(m) })),
          ...customAliasModels,
          ...customRegisteredModels,
        ];
        // Dedupe by value (alias may equal hardcoded id, causing React key collision)
        const seen = new Set();
        let allModels = filterByKind(merged.filter((m) => {
          if (seen.has(m.value)) return false;
          seen.add(m.value);
          return true;
        }));

        // Provider-as-model fallback: providers that support the kind but have no hardcoded models
        // can still be picked (value = providerAlias). Skips embedding (always needs model).
        if (allModels.length === 0 && kindFilter && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
          const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
          if (supports) {
            allModels = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        }

        if (allModels.length > 0) {
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    // Filter out disabled models per provider (disabled keyed by storage alias OR providerId)
    Object.entries(groups).forEach(([providerId, group]) => {
      const aliasKey = getProviderAlias(providerId);
      const disabledIds = new Set([
        ...(disabledModels[aliasKey] || []),
        ...(disabledModels[providerId] || []),
      ]);
      if (disabledIds.size === 0) return;
      group.models = group.models.filter((m) => !disabledIds.has(m.id));
      if (group.models.length === 0) delete groups[providerId];
    });

    // Filter by enabledModels if explicitly configured on any active connection for this provider
    Object.entries(groups).forEach(([providerId, group]) => {
      const providerConns = filteredActiveProviders.filter((p) => p.provider === providerId);
      const explicitEnabled = [];
      for (const conn of providerConns) {
        if (Array.isArray(conn.providerSpecificData?.enabledModels) && conn.providerSpecificData.enabledModels.length > 0) {
          explicitEnabled.push(...conn.providerSpecificData.enabledModels);
        }
      }
      if (explicitEnabled.length > 0) {
        const enabledSet = new Set(explicitEnabled);
        const alias = group.alias || getProviderAlias(providerId) || providerId;
        group.models = group.models.filter((m) =>
          enabledSet.has(m.id) ||
          enabledSet.has(m.value) ||
          enabledSet.has(`${alias}/${m.id}`) ||
          (m.value && enabledSet.has(m.value.replace(`${alias}/`, "")))
        );
        if (group.models.length === 0) delete groups[providerId];
      }
    });

    return groups;
  }, [filteredActiveProviders, modelAliases, allProviders, providerNodes, customModels, disabledModels, kindFilter, effectiveConnections, deactivatedProviderIds, cursorModels, clineModels, clinepassModels, zedModels]);

  // Parse search query into structured query (regex, positive tokens, negative tokens)
  const parsedQuery = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  // Filter combos by search query (and hide combos when kindFilter is set — combos are LLM-only by design)
  const filteredCombos = useMemo(() => {
    if (kindFilter || capFilter) return [];
    if (parsedQuery.isEmpty) return combos;
    return combos.filter(c => matchesSearch(c.name, parsedQuery));
  }, [combos, parsedQuery, kindFilter, capFilter]);

  // Sort models alphabetically, with added models floated to top
  const sortModels = (models) => {
    const added = models.filter(m => addedModelValues.includes(m.value)).sort((a, b) => a.name.localeCompare(b.name));
    const rest = models.filter(m => !addedModelValues.includes(m.value)).sort((a, b) => a.name.localeCompare(b.name));
    return [...added, ...rest];
  };

  // Filter models by search query (supports substring, regex, and negation !token / -token)
  const filteredGroups = useMemo(() => {
    const filtered = {};
    Object.entries(groupedModels).forEach(([providerId, group]) => {
      let models = group.models;
      // Filter by input-modality capability (vision/pdf/audioInput/videoInput).
      if (capFilter) {
        models = models.filter((m) => getCaps(m.value)?.[capFilter] === true);
        if (models.length === 0) return;
      }
      if (!parsedQuery.isEmpty) {
        const providerNameMatches = matchesSearch(group.name, parsedQuery);
        const aliasMatches = allowProviderWildcard && (
          (group.alias && matchesSearch(group.alias, parsedQuery)) ||
          (providerId && matchesSearch(providerId, parsedQuery)) ||
          matchesSearch(`${group.alias}/*`, parsedQuery)
        );

        models = models.filter((m) => {
          if (matchesSearch(m, parsedQuery)) return true;
          // If provider or alias matches, but model doesn't violate negative exclusion terms
          if (providerNameMatches || aliasMatches) {
            if (parsedQuery.negativeTerms.length > 0) {
              return matchesSearch(m, { ...parsedQuery, positiveTerms: [] });
            }
            return true;
          }
          return false;
        });

        if (models.length === 0) return;
      }
      filtered[providerId] = {
        ...group,
        models: sortModels(models),
      };
    });

    return filtered;
  }, [groupedModels, parsedQuery, addedModelValues, allowProviderWildcard]);

  // Visible models available for batch actions (excluding placeholders)
  const visibleModels = useMemo(() => {
    const list = [];
    Object.values(filteredGroups).forEach((group) => {
      group.models.forEach((m) => {
        if (!m.isPlaceholder) {
          list.push(m);
        }
      });
    });
    return list;
  }, [filteredGroups]);

  const visibleUnadded = useMemo(() => {
    return visibleModels.filter((m) => !addedModelValues.includes(m.value));
  }, [visibleModels, addedModelValues]);

  const visibleAdded = useMemo(() => {
    return visibleModels.filter((m) => addedModelValues.includes(m.value));
  }, [visibleModels, addedModelValues]);

  const handleSelectAllVisible = () => {
    if (visibleUnadded.length === 0) return;
    if (onSelectBatch) {
      onSelectBatch(visibleUnadded);
    } else {
      visibleUnadded.forEach((model) => onSelect(model));
    }
  };

  const handleDeselectAllVisible = () => {
    if (visibleAdded.length === 0) return;
    if (onDeselectBatch) {
      onDeselectBatch(visibleAdded);
    } else if (onDeselect) {
      visibleAdded.forEach((model) => onDeselect(model));
    }
  };

  const handleSelect = (model) => {
    const value = model?.value || model?.name || model;
    const isAdded = addedModelValues.includes(value);

    if (isAdded && onDeselect) {
      onDeselect(model);
    } else {
      onSelect(model);
    }

    if (closeOnSelect) {
      onClose();
      setSearchQuery("");
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  const isProviderExpanded = (providerId) => {
    if (isSearching) return true;
    if (expandedProviders[providerId] !== undefined) return expandedProviders[providerId];
    const group = filteredGroups[providerId];
    if (group && group.models.some((m) => addedModelValues.includes(m.value))) return true;
    return false;
  };

  const toggleProvider = (providerId) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [providerId]: !isProviderExpanded(providerId),
    }));
  };

  const handleToggleAll = (expand) => {
    const next = {};
    Object.keys(filteredGroups).forEach((id) => {
      next[id] = expand;
    });
    setExpandedProviders(next);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchQuery("");
      }}
      title={title}
      size={size}
      className="p-3 sm:p-4!"
      footer={null}
    >
      {/* Info bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded text-xs text-[var(--color-mute)] font-mono">
        <span className="material-symbols-outlined text-[var(--color-primary)] shrink-0 text-[14px]">info</span>
        <span className="leading-tight">
          {allowProviderWildcard
            ? "Click provider to reveal models. Click model to select. Click provider tag for wildcard (provider/*)."
            : "Click provider to reveal models. Click model to add/remove."}
        </span>
      </div>

      {/* Search & batch actions */}
      <div className="mb-3 space-y-2 font-mono">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ash)] text-[16px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder={
              allowProviderWildcard
                ? "Search models (e.g. claude -haiku, oc/*)..."
                : "Search models (e.g. claude -haiku, !embed)..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-20 py-2 bg-[var(--color-surface-soft)] border border-[var(--color-hairline)] rounded text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-hairline-strong)] font-mono"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary font-mono font-medium">
                regex
              </span>
            )}
            {parsedQuery.negativeTerms.length > 0 && !parsedQuery.isRegex && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 font-mono font-medium">
                !exclude
              </span>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[var(--color-mute)] hover:text-[var(--color-ink)] cursor-pointer p-0.5 rounded text-[13px]"
                title="Clear search"
              >
                [x]
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1.5 px-0.5 text-[11px] text-[var(--color-mute)]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{visibleModels.length} models</span>
            {addedModelValues.length > 0 && (
              <span className="text-[var(--color-primary)] font-bold">({addedModelValues.length} selected)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {!isSearching && Object.keys(filteredGroups).length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => handleToggleAll(true)}
                  className="px-1.5 py-0.5 text-[10px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded hover:text-[var(--color-ink)] cursor-pointer whitespace-nowrap"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAll(false)}
                  className="px-1.5 py-0.5 text-[10px] border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] rounded hover:text-[var(--color-ink)] cursor-pointer whitespace-nowrap"
                >
                  Collapse all
                </button>
              </>
            )}
            {!closeOnSelect && visibleModels.length > 0 && visibleUnadded.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface-card)] text-[var(--color-ink)] border border-[var(--color-hairline)] hover:bg-[var(--color-surface-soft)] transition-colors cursor-pointer whitespace-nowrap"
                title="Select all filtered models"
              >
                Select All
              </button>
            )}
            {!closeOnSelect && visibleModels.length > 0 && visibleAdded.length > 0 && (
              <button
                type="button"
                onClick={handleDeselectAllVisible}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface-card)] text-[var(--color-mute)] border border-[var(--color-hairline)] hover:text-[var(--color-ink)] transition-colors cursor-pointer whitespace-nowrap"
                title="Deselect all filtered models"
              >
                Deselect All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Models grouped by provider - Accordion style */}
      <div className="max-h-[50vh] sm:max-h-[420px] overflow-y-auto custom-scrollbar space-y-2 font-mono">
        {/* Combos section - always first */}
        {filteredCombos.length > 0 && (
          <div className="border border-[var(--color-hairline)] rounded overflow-hidden">
            <div
              onClick={() => setCombosExpanded((v) => !v)}
              className="flex items-center justify-between p-2.5 bg-[var(--color-surface-soft)] cursor-pointer select-none hover:bg-[var(--color-surface-card)] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[var(--color-primary)] text-[16px]">layers</span>
                <span className="text-[13px] font-bold text-[var(--color-ink)] truncate">Combos</span>
                <span className="text-[11px] text-[var(--color-mute)]">({filteredCombos.length})</span>
              </div>
              <span className="text-[12px] text-[var(--color-ash)] font-bold">
                {combosExpanded ? "[-]" : "[+]"}
              </span>
            </div>
            {combosExpanded && (
              <div className="p-2 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)] flex flex-wrap gap-1.5">
                {filteredCombos.map((combo) => {
                  const isSelected = selectedModel === combo.name;
                  const isAdded = addedModelValues.includes(combo.name);
                  return (
                    <button
                      key={combo.id}
                      onClick={() => handleSelect({ id: combo.name, name: combo.name, value: combo.name })}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors border cursor-pointer flex items-center gap-1",
                        isSelected || isAdded
                          ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]"
                          : "bg-[var(--color-surface-soft)] border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-hairline-strong)]"
                      )}
                    >
                      {isAdded && (
                        <span className="text-[10px] leading-none font-bold">[✓]</span>
                      )}
                      <span>{combo.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Provider models — Accordion */}
        {Object.entries(filteredGroups).map(([providerId, group]) => {
          const wildcardValue = `${group.alias || providerId}/*`;
          const isWildcardAdded = allowProviderWildcard && addedModelValues.includes(wildcardValue);
          const isExpanded = isProviderExpanded(providerId);
          const selectedInGroupCount = group.models.filter((m) => addedModelValues.includes(m.value)).length;

          return (
            <div key={providerId} className="border border-[var(--color-hairline)] rounded overflow-hidden">
              {/* Provider Accordion Header */}
              <div
                onClick={() => toggleProvider(providerId)}
                className="flex items-center justify-between p-2.5 bg-[var(--color-surface-soft)] cursor-pointer select-none hover:bg-[var(--color-surface-card)] transition-colors gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ProviderIcon
                    src={`/providers/${providerId}.png`}
                    alt={group.name}
                    size={16}
                    fallbackText={(group.name || providerId).slice(0, 2).toUpperCase()}
                    fallbackColor={group.color}
                  />
                  <span className="text-[13px] font-bold text-[var(--color-ink)] truncate">
                    {group.name}
                  </span>
                  <span className="text-[11px] text-[var(--color-mute)] shrink-0">
                    ({group.models.length})
                  </span>
                  {selectedInGroupCount > 0 && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold text-[var(--color-primary)] border border-[var(--color-primary)]/40 rounded shrink-0">
                      {selectedInGroupCount} selected
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {allowProviderWildcard && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect({ value: wildcardValue, name: wildcardValue });
                      }}
                      title={isWildcardAdded ? `Click to remove wildcard ${wildcardValue}` : `Click to allow all models from ${group.name} (${wildcardValue})`}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer",
                        isWildcardAdded
                          ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]"
                          : "border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                      )}
                    >
                      {wildcardValue}
                    </button>
                  )}
                  <span className="text-[12px] font-bold text-[var(--color-ash)]">
                    {isExpanded ? "[-]" : "[+]"}
                  </span>
                </div>
              </div>

              {/* Expanded models list */}
              {isExpanded && (
                <div className="p-2.5 bg-[var(--color-canvas)] border-t border-[var(--color-hairline)] flex flex-wrap gap-1.5">
                  {group.models.map((model) => {
                    const isSelected = selectedModel === model.value;
                    const isAdded = addedModelValues.includes(model.value);
                    const isPlaceholder = model.isPlaceholder;

                    return (
                      <button
                        key={model.value}
                        onClick={() => handleSelect(model)}
                        title={isPlaceholder ? "Select to pre-fill, then edit model ID in the input" : undefined}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors border cursor-pointer flex items-center gap-1",
                          isPlaceholder
                            ? "border-dashed border-[var(--color-hairline)] text-[var(--color-mute)] italic bg-[var(--color-surface-soft)]"
                            : isSelected || isAdded
                              ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]"
                              : "bg-[var(--color-surface-soft)] border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-hairline-strong)]"
                        )}
                      >
                        {isAdded && !isPlaceholder && (
                          <span className="text-[10px] font-bold leading-none">[✓]</span>
                        )}
                        {isPlaceholder ? (
                          <>
                            <span className="material-symbols-outlined text-[11px]">edit</span>
                            <span>{model.name}</span>
                          </>
                        ) : (
                          <>
                            <span>{model.name}</span>
                            {model.isCustom && (
                              <span className="text-[9px] opacity-70 font-normal">custom</span>
                            )}
                            <CapacityBadges caps={getCaps(model.value)} />
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
          <div className="text-center py-8 text-[var(--color-mute)] border border-dashed border-[var(--color-hairline)] rounded">
            <span className="material-symbols-outlined text-2xl mb-1 block">search_off</span>
            <p className="text-xs">No models found</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onDeselect: PropTypes.func,
  onSelectBatch: PropTypes.func,
  onDeselectBatch: PropTypes.func,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    })
  ),
  title: PropTypes.string,
  size: PropTypes.string,
  modelAliases: PropTypes.object,
  kindFilter: PropTypes.string,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  closeOnSelect: PropTypes.bool,
  allowProviderWildcard: PropTypes.bool,
};

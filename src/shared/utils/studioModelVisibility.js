// A studio (custom) model stands in for whatever it points at: once a base
// model has a studio name, the base should stop showing up in listings so only
// the name the user chose is visible. Studio targets are recorded as
// `providerId/model`, so the lookup is keyed by provider then model id.
// Routing is untouched: the base model still answers calls, it is just not
// offered anywhere. The model editor opts out because it needs the raw model to
// create the mapping in the first place.

export function buildStudioTargetIndex(studioModels) {
  const byProvider = new Map();
  const add = (provider, modelId) => {
    const pKey = String(provider || "").trim().toLowerCase();
    const mKey = String(modelId || "").trim().toLowerCase();
    if (!pKey || !mKey) return;
    if (!byProvider.has(pKey)) byProvider.set(pKey, new Set());
    byProvider.get(pKey).add(mKey);
  };

  for (const studio of studioModels || []) {
    if (!studio?.provider || !studio?.model) continue;
    add(studio.provider, studio.model);
  }

  return {
    /** True when that model of these provider keys is hidden behind a studio name. */
    isStudioTarget(providerKeys, modelId) {
      const mKey = String(modelId || "").trim().toLowerCase();
      if (!mKey) return false;
      const keys = Array.isArray(providerKeys) ? providerKeys : [providerKeys];
      return keys.some((key) => byProvider.get(String(key || "").trim().toLowerCase())?.has(mKey) === true);
    },
    size: byProvider.size,
  };
}

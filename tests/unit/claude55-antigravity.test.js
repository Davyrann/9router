import { describe, it, expect } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import antigravityRegistry from "../../open-sse/providers/registry/antigravity.js";
import { MODEL_PRICING } from "../../open-sse/providers/pricing.js";
import { MITM_TOOLS } from "../../src/shared/constants/cliTools.js";

const AG_IDS = antigravityRegistry.models.map((m) => m.id);
const AG_TOOL = MITM_TOOLS.antigravity;

describe("Antigravity: Claude 5.5 models", () => {
  it("registers Claude Sonnet 5.5 in the antigravity provider registry", () => {
    expect(AG_IDS).toContain("claude-sonnet-5-5");
    expect(AG_IDS).toContain("claude-sonnet-5-5-thinking");
  });

  it("registers every Claude Opus 5.5 variant in the antigravity provider registry", () => {
    expect(AG_IDS).toContain("claude-opus-5.5");
    expect(AG_IDS).toContain("claude-opus-5.5-thinking");
    expect(AG_IDS).toContain("claude-opus-5.5-agentic");
    expect(AG_IDS).toContain("claude-opus-5.5-thinking-agentic");
  });

  it("keeps the 4.6 models so existing traffic keeps working", () => {
    expect(AG_IDS).toContain("claude-sonnet-4-6");
    expect(AG_IDS).toContain("claude-opus-4-6-thinking");
  });

  it("registers no duplicate model ids", () => {
    expect(new Set(AG_IDS).size).toBe(AG_IDS.length);
  });

  it("resolves Opus 5.5 capabilities with 1M context and adaptive thinking", () => {
    for (const id of [
      "claude-opus-5.5",
      "claude-opus-5.5-thinking",
      "claude-opus-5.5-agentic",
      "claude-opus-5.5-thinking-agentic",
    ]) {
      const caps = getCapabilitiesForModel("antigravity", id);
      expect(caps.vision, id).toBe(true);
      expect(caps.reasoning, id).toBe(true);
      expect(caps.thinkingFormat, id).toBe("claude-adaptive");
      expect(caps.contextWindow, id).toBe(1000000);
      expect(caps.maxOutput, id).toBe(128000);
    }
  });

  it("resolves Sonnet 5.5 capabilities with 1M context and adaptive thinking", () => {
    for (const id of ["claude-sonnet-5-5", "claude-sonnet-5-5-thinking"]) {
      const caps = getCapabilitiesForModel("antigravity", id);
      expect(caps.vision, id).toBe(true);
      expect(caps.reasoning, id).toBe(true);
      expect(caps.thinkingFormat, id).toBe("claude-adaptive");
      expect(caps.contextWindow, id).toBe(1000000);
      expect(caps.maxOutput, id).toBe(128000);
    }
  });

  it("prices Opus 5.5 at the Antigravity Opus rate card", () => {
    for (const id of [
      "claude-opus-5.5",
      "claude-opus-5.5-thinking",
      "claude-opus-5.5-agentic",
      "claude-opus-5.5-thinking-agentic",
    ]) {
      expect(MODEL_PRICING[id], id).toBeDefined();
      expect(MODEL_PRICING[id].input, id).toBe(5.0);
      expect(MODEL_PRICING[id].output, id).toBe(25.0);
    }
  });

  it("exposes the 5.5 models in the Antigravity CLI-tool entry", () => {
    expect(AG_TOOL).toBeDefined();
    for (const id of [
      "claude-opus-5.5",
      "claude-opus-5.5-thinking",
      "claude-opus-5.5-agentic",
      "claude-sonnet-5-5",
      "claude-sonnet-5-5-thinking",
    ]) {
      expect(AG_TOOL.modelAliases, id).toContain(id);
      expect(AG_TOOL.defaultModels.map((m) => m.id), id).toContain(id);
    }
  });
});
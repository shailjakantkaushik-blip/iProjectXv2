import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayRag, effectiveRag } from "./ops-enhancements.ts";
import { scoreToRag } from "./project-health-engine.ts";

describe("project summary RAG vs health score", () => {
  it("maps Health Engine scores onto the same Green / Amber / Red bands as the cockpit", () => {
    assert.equal(scoreToRag(87), "Green");
    assert.equal(scoreToRag(80), "Green");
    assert.equal(scoreToRag(79), "Amber");
    assert.equal(scoreToRag(65), "Amber");
    assert.equal(scoreToRag(64), "Red");
  });

  it("uses Health Engine RAG when the register colour disagrees, unless overridden", () => {
    const registerGreen = { rag: "Green", rag_override: null };
    assert.equal(displayRag(registerGreen), "Green");
    assert.equal(effectiveRag(registerGreen, scoreToRag(58)), "Red");
    assert.equal(effectiveRag({ rag: "Green", rag_override: "Amber" }, "Red"), "Amber");
  });
});

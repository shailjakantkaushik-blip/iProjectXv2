import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  childApprovedByProgram,
  envelopeLookupKey,
  overlayParentEnvelopeRag,
  parentEnvelopeStatus,
  programApprovedKey,
} from "./hierarchy-envelope.ts";

describe("hierarchy envelopes stay above project and FY slices", () => {
  it("scopes program pots under Strategic Alignment", () => {
    assert.equal(programApprovedKey("Digital", "Core"), "Digital|||Core");
    assert.equal(
      envelopeLookupKey("program", "Core", "Digital"),
      "program:digital|core",
    );
    assert.equal(envelopeLookupKey("alignment", "Digital"), "alignment:digital");
  });

  it("does not mix two programs that share a name under different alignments", () => {
    const sums = childApprovedByProgram([
      { portfolio: "Digital", program: "Core", budget: 40 },
      { portfolio: "Ops", program: "Core", budget: 25 },
    ]);
    assert.equal(sums.get("Digital|||Core"), 40);
    assert.equal(sums.get("Ops|||Core"), 25);
  });

  it("RAG: green under 90%, amber at/over 90% or any over, red over 10%", () => {
    assert.equal(parentEnvelopeStatus(100, 80).rag, "Green");
    assert.equal(parentEnvelopeStatus(100, 90).rag, "Amber");
    assert.equal(parentEnvelopeStatus(100, 105).rag, "Amber");
    assert.equal(parentEnvelopeStatus(100, 112).rag, "Red");
    assert.equal(parentEnvelopeStatus(null, 50).constrained, false);
  });

  it("parent pot can worsen a child RAG but never improves it", () => {
    assert.equal(overlayParentEnvelopeRag("Green", parentEnvelopeStatus(100, 95)), "Amber");
    assert.equal(overlayParentEnvelopeRag("Red", parentEnvelopeStatus(100, 80)), "Red");
  });
});

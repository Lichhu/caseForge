import type { ApiCaseStep, ApiHttpCaseStep } from "@case-forge/shared";
import { ApiPreproductionCaseEntity } from "../entity/api-preproduction-case.entity";
import {
  REQUEST_STORED_IN_STEPS_KEY,
  compactCasePayloadStorage,
  restoreCasePayloadStorage,
} from "./api-case-payload-storage.util";

function largeCasePayload(size = 1400 * 1024) {
  const bodyText = JSON.stringify({ value: "A".repeat(size) });
  const request = {
    method: "POST",
    path: "/large",
    body: JSON.parse(bodyText),
    bodyText,
  };
  const steps: ApiCaseStep[] = [
    {
      id: "step-1",
      name: "大报文",
      isMainRequest: true,
      request,
      expected: { assertions: [] },
      exports: [],
    },
  ];
  return {
    request,
    expected: { assertions: [] },
    steps,
    metadata: { source: "manual" as const },
  };
}

describe("api-case-payload-storage", () => {
  it("keeps small case payloads unchanged", () => {
    const input = {
      request: { method: "GET", path: "/small" },
      expected: { assertions: [] },
      steps: [],
    };

    expect(compactCasePayloadStorage(input)).toEqual(input);
  });

  it("stores a large request body once in steps", () => {
    const input = largeCasePayload();
    const compacted = compactCasePayloadStorage(input);

    expect(compacted.request.body).toBeUndefined();
    expect(compacted.request.bodyText).toBeUndefined();
    expect(compacted.steps?.[0]).toMatchObject({
      request: {
        method: "POST",
        path: "/large",
      },
    });
    expect(compacted.steps?.[0]).toHaveProperty("request.body");
    expect(compacted.steps?.[0]).not.toHaveProperty("request.bodyText");
    expect(
      (compacted.metadata as Record<string, unknown> | undefined)?.[
        REQUEST_STORED_IN_STEPS_KEY
      ],
    ).toBe(true);
    expect(JSON.stringify(compacted).length).toBeLessThan(
      JSON.stringify(input).length / 2,
    );
  });

  it("restores the main request after loading a compacted case", () => {
    const compacted = compactCasePayloadStorage(largeCasePayload());
    const restored = restoreCasePayloadStorage(compacted);
    const restoredStep = restored.steps?.[0] as ApiHttpCaseStep;

    expect(restored.request).toBe(restoredStep.request);
    expect(restored.request.body).toBeDefined();
  });

  it("can compact an already compacted case without losing data", () => {
    const compacted = compactCasePayloadStorage(largeCasePayload());
    const compactedAgain = compactCasePayloadStorage(compacted);
    const compactedStep = compactedAgain.steps?.[0] as ApiHttpCaseStep;

    expect(compactedStep.request.body).toBeDefined();
    expect(JSON.stringify(compactedAgain)).toBe(JSON.stringify(compacted));
  });

  it("keeps bodyText when legacy data has no executable body", () => {
    const bodyText = "A".repeat(100 * 1024);
    const compacted = compactCasePayloadStorage({
      request: { method: "POST", path: "/legacy", bodyText },
      expected: { assertions: [] },
      steps: [],
    });

    expect(compacted.request.bodyText).toBe(bodyText);
  });

  it("ignores partial entities that did not select snapshot fields", () => {
    expect(
      restoreCasePayloadStorage(
        undefined as unknown as ReturnType<typeof compactCasePayloadStorage>,
      ),
    ).toBeUndefined();

    const partialEntity = new ApiPreproductionCaseEntity();
    expect(() => partialEntity.restoreLargePayload()).not.toThrow();
  });
});

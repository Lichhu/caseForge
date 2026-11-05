import {
  isHttpStep,
  type ApiCaseExpected,
  type ApiCaseRequest,
  type ApiCaseStep,
} from "@case-forge/shared";

/**
 * 超过该体积时，案例只把主请求报文保留在 steps 中。
 * 避免 request 与主步骤重复序列化，导致单条 MySQL SQL 超过 max_allowed_packet。
 */
export const CASE_PAYLOAD_COMPACT_THRESHOLD_BYTES = 512 * 1024;

/** 大报文不再重复保存编辑器原文，读取时会从 body 还原为可编辑文本。 */
export const LARGE_BODY_TEXT_OMIT_THRESHOLD_BYTES = 64 * 1024;

export const REQUEST_STORED_IN_STEPS_KEY = "requestStoredInSteps";

export interface CasePayloadStorageShape {
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  steps?: ApiCaseStep[];
  metadata?: Record<string, unknown>;
}

function jsonByteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

function withoutLargeBodyText(request: ApiCaseRequest): ApiCaseRequest {
  if (
    typeof request.bodyText !== "string" ||
    request.body === undefined ||
    request.body === null ||
    Buffer.byteLength(request.bodyText, "utf8") <=
      LARGE_BODY_TEXT_OMIT_THRESHOLD_BYTES
  ) {
    return request;
  }
  const { bodyText: _bodyText, ...rest } = request;
  return rest;
}

function withoutRequestPayload(request: ApiCaseRequest): ApiCaseRequest {
  const { body: _body, bodyText: _bodyText, ...rest } = request;
  return rest;
}

function mainHttpStep(steps?: ApiCaseStep[]) {
  const httpSteps = (steps ?? []).filter(isHttpStep);
  return httpSteps.find((step) => step.isMainRequest) ?? httpSteps[0];
}

/**
 * 小案例保持原有结构；大案例只保存一份请求报文。
 * 该函数可安全重复调用。
 */
export function compactCasePayloadStorage<T extends CasePayloadStorageShape>(
  input: T,
): T {
  if (!input?.request || !input.expected) return input;
  const compactedSteps = input.steps?.map((step) =>
    isHttpStep(step)
      ? { ...step, request: withoutLargeBodyText(step.request) }
      : step,
  );
  const mainStep = mainHttpStep(compactedSteps);
  const payloadBytes =
    jsonByteLength(input.request) +
    jsonByteLength(input.expected) +
    (input.steps ?? []).reduce(
      (total, step) =>
        total +
        (isHttpStep(step)
          ? jsonByteLength(step.request) + jsonByteLength(step.expected)
          : 0),
      0,
    );
  if (!mainStep || payloadBytes <= CASE_PAYLOAD_COMPACT_THRESHOLD_BYTES) {
    return {
      ...input,
      steps: compactedSteps,
    };
  }

  return {
    ...input,
    request: withoutRequestPayload(mainStep.request),
    expected: mainStep.expected,
    steps: compactedSteps,
    metadata: {
      ...(input.metadata ?? {}),
      [REQUEST_STORED_IN_STEPS_KEY]: true,
    },
  };
}

/**
 * 将压缩保存的主请求恢复到顶层字段。
 * 旧数据没有 requestStoredInSteps 标记时保持原样。
 */
export function restoreCasePayloadStorage<T extends CasePayloadStorageShape>(
  input: T,
): T {
  if (!input?.request || !input.expected) return input;
  if (!input.metadata?.[REQUEST_STORED_IN_STEPS_KEY]) return input;
  const mainStep = mainHttpStep(input.steps);
  if (!mainStep) return input;
  return {
    ...input,
    request: mainStep.request,
    expected: mainStep.expected,
  };
}

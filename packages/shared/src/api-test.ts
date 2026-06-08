export type ApiCasePolarity = 'positive' | 'negative';
export type ApiCasePriority = 'P0' | 'P1' | 'P2';
export type ApiCaseSource = 'ai' | 'manual' | 'ai_edited';
export type ApiCaseStatus = 'draft' | 'ready' | 'disabled';
export type ApiRunItemStatus = 'passed' | 'failed' | 'error' | 'skipped';
export type ApiStructuringStatus = 'idle' | 'processing' | 'completed' | 'failed';

export interface ApiBodyAssertion {
  type: 'jsonPath' | 'contains' | 'equals' | 'matches';
  path?: string;
  expected: unknown;
  description?: string;
}

export interface ApiCaseRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  contentType?: string;
}

export interface ApiCaseExpected {
  statusCode: number | number[];
  bodyAssertions?: ApiBodyAssertion[];
  statusOnly?: boolean;
  maxDurationMs?: number;
}

export interface ApiTestCasePayload {
  title: string;
  description: string;
  priority: ApiCasePriority;
  polarity: ApiCasePolarity;
  enabled: boolean;
  status: ApiCaseStatus;
  preconditions: string[];
  request: ApiCaseRequest;
  expected: ApiCaseExpected;
  metadata?: {
    source?: ApiCaseSource;
    inferredFields?: string[];
  };
}

export interface ApiEndpointPayload {
  id?: string;
  name: string;
  method: string;
  path: string;
  summary?: string;
  requestNotes?: string;
  responseNotes?: string;
  tags?: string[];
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

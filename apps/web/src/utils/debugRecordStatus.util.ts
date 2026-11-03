import type { ApiStepDebugRecord } from "@case-forge/shared";

export type DebugRecordProtocol = "HTTP" | "SOCKET" | "MQ" | "SQL";

type DebugRecordSource =
  | ApiStepDebugRecord
  | { id?: string; createdAt?: string; record: ApiStepDebugRecord };

function unwrapRecord(source: DebugRecordSource) {
  return "record" in source ? source.record : source;
}

export function debugRecordProtocol(
  source: DebugRecordSource,
): DebugRecordProtocol {
  const record = unwrapRecord(source);
  const request = record.request as
    | { kind?: string; transport?: string }
    | null
    | undefined;
  if (request?.kind === "db") return "SQL";
  const transport = String(
    request?.transport ?? record.target?.address ?? "",
  ).toLowerCase();
  if (transport === "tcp" || transport.startsWith("socket")) return "SOCKET";
  if (transport === "mq" || transport.startsWith("mq")) return "MQ";
  return "HTTP";
}

export function debugRecordConnected(source: DebugRecordSource) {
  const record = unwrapRecord(source);
  if (record.error) return false;
  const protocol = debugRecordProtocol(record);
  if (protocol === "SQL") {
    return record.statusCode >= 200 && record.statusCode < 400;
  }
  if (protocol === "SOCKET" || protocol === "MQ") {
    return record.statusCode === -1;
  }
  return record.statusCode > 0;
}

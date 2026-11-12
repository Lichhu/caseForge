import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "@config/app-config.types";
import { RequestContext } from "@common/audit/request-context";
import { AuthAuditService, toCsvCell } from "./auth-audit.service";

const authConfig: AppConfig["auth"] = {
  appId: "764",
  ticketValidateUrl: "http://localhost/ticket",
  jwtSecret: "caseforge-test-secret-at-least-32-bytes",
  jwtIssuer: "caseforge",
  jwtAudience: "caseforge-web",
  sessionDurationMs: 604_800_000,
  impersonationDurationMs: 28_800_000,
  impersonationAdminUsers: ["system"],
  auditAdminUsers: ["system"],
  auditMaxQueryDays: 31,
  auditMaxExportRows: 100_000,
  auditRetentionDays: 180,
  auditArchiveRetentionDays: 730,
  auditSummaryIntervalMs: 300_000,
  auditPartitionIntervalMs: 21_600_000,
  auditExportDir: ".data/auth-audit-exports",
  auditExportRetentionDays: 7,
  auditExportWarnBytes: 5 * 1024 * 1024 * 1024,
  auditPartitionAheadMonths: 6,
  cookieName: "caseforge_auth",
  cookieSecure: false,
  ticketValidateTimeoutMs: 10_000,
};

describe("AuthAuditService", () => {
  const insert = jest.fn();
  const eventRepo = { insert };
  const dailyRepo = { createQueryBuilder: jest.fn() };
  const exportRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  const config = {
    get: (key: string) => (key === "auth" ? authConfig : undefined),
  } as unknown as ConfigService<AppConfig>;
  const service = new AuthAuditService(
    eventRepo as never,
    dailyRepo as never,
    exportRepo as never,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    insert.mockResolvedValue(undefined);
  });

  it("normalizes and inserts an audit event with a derived request id", async () => {
    await RequestContext.run(
      "system",
      () =>
        service.record({
          eventType: "login_success",
          userName: "  alice  ",
          actorUserName: "alice",
          clientIp: "192.168.1.10",
          sessionId: "session-1",
          reason: "r".repeat(240),
        }),
      undefined,
      "req-1",
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "login_success",
        userName: "alice",
        actorUserName: "alice",
        clientIp: Buffer.from([192, 168, 1, 10]),
        sessionId: "session-1",
        requestId: "req-1",
        reason: "r".repeat(200),
      }),
    );
  });

  it("never fails the caller when a normal audit write fails", async () => {
    insert.mockRejectedValue(new Error("db unavailable"));

    await expect(
      service.record({ eventType: "logout", userName: "alice" }),
    ).resolves.toBeUndefined();
  });

  it("throws when a strict audit write fails", async () => {
    insert.mockRejectedValue(new Error("db unavailable"));

    await expect(
      service.recordStrict({
        eventType: "impersonation_start",
        actorUserName: "system",
        userName: "alice",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects queries longer than the configured range", async () => {
    const from = new Date("2026-10-01T00:00:00.000Z");
    const to = new Date(from.getTime() + 32 * 24 * 60 * 60 * 1000);

    await expect(
      service.queryEvents({
        from: from.toISOString(),
        to: to.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects summary ranges longer than the configured days", async () => {
    const from = new Date("2026-10-01T00:00:00.000Z");
    const to = new Date(from.getTime() + 32 * 24 * 60 * 60 * 1000);

    await expect(
      service.summarize({
        from: from.toISOString(),
        to: to.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid IP filters", async () => {
    await expect(
      service.queryEvents({
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-02T00:00:00.000Z",
        ip: "999.1.1.1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recovers pending exports and fails interrupted running jobs", async () => {
    exportRepo.update.mockResolvedValue({ affected: 1 });
    exportRepo.find.mockResolvedValue([]);

    await service.recoverExports();

    expect(exportRepo.update).toHaveBeenCalledWith(
      { status: "running" },
      expect.objectContaining({ status: "failed" }),
    );
    expect(exportRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "pending" } }),
    );
  });

  it("escapes CSV formula injection and quotes", () => {
    expect(toCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(toCsvCell("+1")).toBe("'+1");
    expect(toCsvCell('a"b')).toBe('"a""b"');
    expect(toCsvCell(null)).toBe("");
  });
});

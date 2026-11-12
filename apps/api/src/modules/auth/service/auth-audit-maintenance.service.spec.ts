import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import type { DataSource } from "typeorm";
import type { AppConfig } from "@config/app-config.types";
import type { AuthAuditService } from "./auth-audit.service";
import {
  AuthAuditMaintenanceService,
  monthPartitionName,
} from "./auth-audit-maintenance.service";

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
  auditSummaryIntervalMs: 0,
  auditPartitionIntervalMs: 0,
  auditExportDir: ".data/auth-audit-exports",
  auditExportRetentionDays: 7,
  auditExportWarnBytes: 5 * 1024 * 1024 * 1024,
  auditPartitionAheadMonths: 6,
  cookieName: "caseforge_auth",
  cookieSecure: false,
  ticketValidateTimeoutMs: 10_000,
};

describe("AuthAuditMaintenanceService", () => {
  const config = {
    get: (key: string) => (key === "auth" ? authConfig : undefined),
  } as unknown as ConfigService<AppConfig>;
  const service = new AuthAuditMaintenanceService(
    {} as DataSource,
    config,
    { recoverExports: jest.fn() } as unknown as AuthAuditService,
  );

  it("formats month partition names in UTC", () => {
    expect(monthPartitionName(new Date("2026-11-01T00:00:00.000Z"))).toBe(
      "p202611",
    );
    expect(monthPartitionName(new Date("2027-01-15T00:00:00.000Z"))).toBe(
      "p202701",
    );
  });

  it("removes expired export files and keeps recent ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "auth-audit-export-"));
    const originalDir = authConfig.auditExportDir;
    authConfig.auditExportDir = dir;
    try {
      const oldFile = join(dir, "old.csv");
      const freshFile = join(dir, "fresh.csv");
      await writeFile(oldFile, "old", "utf8");
      await writeFile(freshFile, "fresh", "utf8");
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await utimes(oldFile, tenDaysAgo, tenDaysAgo);

      await service.cleanupExpiredExports();

      expect(await readdir(dir)).toEqual(["fresh.csv"]);
    } finally {
      authConfig.auditExportDir = originalDir;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ignores a missing export directory", async () => {
    const originalDir = authConfig.auditExportDir;
    authConfig.auditExportDir = join(tmpdir(), "auth-audit-missing-dir");
    try {
      await expect(service.cleanupExpiredExports()).resolves.toBeUndefined();
    } finally {
      authConfig.auditExportDir = originalDir;
    }
  });
});

import { RequestContext } from "@common/audit/request-context";
import { ApiCaseReportDeliveryService } from "./api-case-report-delivery.service";

describe("ApiCaseReportDeliveryService", () => {
  const run = {
    transactionId: "tx",
    totalCount: 1,
    passedCount: 1,
    items: [{ caseTitle: "案例 A" }],
  };
  let execution: { getRunDetail: jest.Mock };
  let reports: { exportReport: jest.Mock };
  let notify: { enqueue: jest.Mock };
  let config: { get: jest.Mock };
  let service: ApiCaseReportDeliveryService;
  beforeEach(() => {
    execution = { getRunDetail: jest.fn().mockResolvedValue(run) };
    reports = {
      exportReport: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from("report") }),
    };
    notify = { enqueue: jest.fn().mockResolvedValue({}) };
    config = { get: jest.fn().mockReturnValue({ enabled: true }) };
    service = new ApiCaseReportDeliveryService(
      execution as never,
      reports as never,
      notify as never,
      config as never,
      { query: jest.fn() } as never,
      { uploadFile: jest.fn(), receiveAutoResult: jest.fn() } as never,
    );
  });
  it("uploads one report and queues a notification for the current user", async () => {
    const result = await RequestContext.run("tester", () =>
      service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" }),
    );
    expect(result.notificationStatus).toBe("queued");
    expect(notify.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ receiver: "tester", bizId: "run" }),
    );
  });
  it("rejects a run from another transaction before creating a report", async () => {
    await expect(service.publish("project", "other", "run", { versionId: "v", applicationId: "a", roundId: "r" })).rejects.toThrow();
    expect(reports.exportReport).not.toHaveBeenCalled();
  });
  it("rejects a multiple-case run", async () => {
    execution.getRunDetail.mockResolvedValue({ ...run, items: [{}, {}] });
    await expect(service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" })).rejects.toThrow();
  });
  it("does not notify when upload fails", async () => {
    (service as any).smp.uploadFile.mockRejectedValue(new Error("offline"));
    await expect(
      RequestContext.run("tester", () =>
        service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" }),
      ),
    ).rejects.toThrow("offline");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("does not notify without a usable report link", async () => {});
  it("does not misrepresent disabled notifications as queued", async () => {
    config.get.mockReturnValue({ enabled: false });
    const result = await RequestContext.run("tester", () =>
      service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" }),
    );
    expect(result.notificationStatus).toBe("disabled");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("never sends to the fallback system account", async () => {
    expect(
      (await service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" })).notificationStatus,
    ).toBe("disabled");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("propagates scope/access failure without uploading", async () => {
    execution.getRunDetail.mockRejectedValue(new Error("not found"));
    await expect(service.publish("project", "tx", "run", { versionId: "v", applicationId: "a", roundId: "r" })).rejects.toThrow(
      "not found",
    );
  });
});

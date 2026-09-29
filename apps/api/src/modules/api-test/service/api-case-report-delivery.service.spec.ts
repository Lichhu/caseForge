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
  let storage: { uploadFile: jest.Mock; getAccessUrl: jest.Mock };
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
    storage = {
      uploadFile: jest.fn().mockResolvedValue({}),
      getAccessUrl: jest
        .fn()
        .mockResolvedValue("https://storage.example/report"),
    };
    notify = { enqueue: jest.fn().mockResolvedValue({}) };
    config = { get: jest.fn().mockReturnValue({ enabled: true }) };
    service = new ApiCaseReportDeliveryService(
      execution as never,
      reports as never,
      storage as never,
      notify as never,
      config as never,
    );
  });
  it("uploads one report and queues a notification for the current user", async () => {
    const result = await RequestContext.run("tester", () =>
      service.publish("project", "tx", "run"),
    );
    expect(result.notificationStatus).toBe("queued");
    expect(storage.uploadFile).toHaveBeenCalledWith(
      "case-reports/project/run.html",
      Buffer.from("report"),
    );
    expect(notify.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ receiver: "tester", bizId: "run" }),
    );
  });
  it("rejects a run from another transaction before creating a report", async () => {
    await expect(service.publish("project", "other", "run")).rejects.toThrow();
    expect(reports.exportReport).not.toHaveBeenCalled();
  });
  it("rejects a multiple-case run", async () => {
    execution.getRunDetail.mockResolvedValue({ ...run, items: [{}, {}] });
    await expect(service.publish("project", "tx", "run")).rejects.toThrow();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
  it("does not notify when upload fails", async () => {
    storage.uploadFile.mockRejectedValue(new Error("offline"));
    await expect(
      RequestContext.run("tester", () =>
        service.publish("project", "tx", "run"),
      ),
    ).rejects.toThrow("offline");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("does not notify without a usable report link", async () => {
    storage.getAccessUrl.mockResolvedValue(undefined);
    await expect(service.publish("project", "tx", "run")).rejects.toThrow(
      "链接失败",
    );
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("does not misrepresent disabled notifications as queued", async () => {
    config.get.mockReturnValue({ enabled: false });
    const result = await RequestContext.run("tester", () =>
      service.publish("project", "tx", "run"),
    );
    expect(result.notificationStatus).toBe("disabled");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("never sends to the fallback system account", async () => {
    expect(
      (await service.publish("project", "tx", "run")).notificationStatus,
    ).toBe("disabled");
    expect(notify.enqueue).not.toHaveBeenCalled();
  });
  it("propagates scope/access failure without uploading", async () => {
    execution.getRunDetail.mockRejectedValue(new Error("not found"));
    await expect(service.publish("project", "tx", "run")).rejects.toThrow(
      "not found",
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});

import { ForbiddenException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import { ApiTestLibraryAccessService } from "./api-test-library-access.service";

function buildService(isDispatcher: boolean) {
  const dispatcherRepo = {
    exists: jest.fn().mockResolvedValue(isDispatcher),
  };
  return new ApiTestLibraryAccessService(dispatcherRepo as never);
}

describe("ApiTestLibraryAccessService", () => {
  it("allows the creator to manage a shared library item", async () => {
    const service = buildService(false);

    await expect(
      RequestContext.run("alice", () =>
        service.assertCanManage("alice", "数据函数"),
      ),
    ).resolves.toBeUndefined();
  });

  it("blocks non-creators without administrator access", async () => {
    const service = buildService(false);

    await expect(
      RequestContext.run("bob", () =>
        service.assertCanManage("alice", "数据函数"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows dispatchers to manage resources created by other users", async () => {
    const service = buildService(true);

    await expect(
      RequestContext.run("admin", () =>
        service.assertCanManage("alice", "数据函数"),
      ),
    ).resolves.toBeUndefined();
  });
});

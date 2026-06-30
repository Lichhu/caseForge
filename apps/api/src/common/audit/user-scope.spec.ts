import { NotFoundException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import {
  SYSTEM_OWNER,
  assertAccessible,
  assertOwned,
  scopedWhere,
  scopedWhereWithSystem,
} from "@common/audit/user-scope";

describe("user-scope", () => {
  describe("scopedWhere", () => {
    it("默认用户为 system 时追加 createdBy=system", () => {
      expect(scopedWhere({ projectId: "p1" })).toEqual({
        projectId: "p1",
        createdBy: SYSTEM_OWNER,
      });
    });

    it("在 RequestContext 内使用当前用户名", () => {
      RequestContext.run("alice", () => {
        expect(scopedWhere({ id: "x" })).toEqual({
          id: "x",
          createdBy: "alice",
        });
      });
    });
  });

  describe("scopedWhereWithSystem", () => {
    it("返回 [当前用户, system] 两个 OR 条件", () => {
      RequestContext.run("bob", () => {
        expect(scopedWhereWithSystem({ scope: "case" })).toEqual([
          { scope: "case", createdBy: "bob" },
          { scope: "case", createdBy: SYSTEM_OWNER },
        ]);
      });
    });
  });

  describe("assertOwned", () => {
    it("实体为空时抛 404", () => {
      expect(() => assertOwned(null, "项目")).toThrow(NotFoundException);
    });

    it("归属他人时抛 404（不泄露存在性）", () => {
      RequestContext.run("alice", () => {
        expect(() => assertOwned({ createdBy: "bob" }, "项目")).toThrow(
          NotFoundException,
        );
      });
    });

    it("归属当前用户时通过", () => {
      RequestContext.run("alice", () => {
        expect(() => assertOwned({ createdBy: "alice" })).not.toThrow();
      });
    });
  });

  describe("assertAccessible", () => {
    it("系统预置资源对任何用户可见", () => {
      RequestContext.run("alice", () => {
        expect(() =>
          assertAccessible({ createdBy: SYSTEM_OWNER }),
        ).not.toThrow();
      });
    });

    it("他人私有资源不可见，抛 404", () => {
      RequestContext.run("alice", () => {
        expect(() => assertAccessible({ createdBy: "bob" })).toThrow(
          NotFoundException,
        );
      });
    });
  });
});

import { UnauthorizedException } from "@nestjs/common";
import { UserContextMiddleware } from "./user-context.middleware";

describe("UserContextMiddleware", () => {
  const middleware = new UserContextMiddleware();

  function run(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
    const next = jest.fn();
    middleware.use(
      { headers, query, url: "/api/v1/requirement-platform/requirements" } as never,
      {} as never,
      next,
    );
    return next;
  }

  it("rejects requests without an identity", () => {
    const next = run();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedException));
  });

  it("accepts a supplied user identity", () => {
    const next = run({ "x-user-name": "1471" });
    expect(next).toHaveBeenCalledWith();
  });

  it("accepts system only when it is explicitly supplied", () => {
    const next = run({ "x-user-name": "system" });
    expect(next).toHaveBeenCalledWith();
  });
});

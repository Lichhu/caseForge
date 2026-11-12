import { RequestContext } from "./request-context";

describe("request-context", () => {
  it("keeps system as the background-task context outside a request", () => {
    expect(RequestContext.getUserName()).toBe("system");
  });

  it("keeps the effective user and original actor during impersonation", () => {
    RequestContext.run(
      "alice",
      () => {
        expect(RequestContext.getUserName()).toBe("alice");
        expect(RequestContext.getActorUserName()).toBe("system");
      },
      "system",
    );
  });
});

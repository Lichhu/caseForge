import { RequestContext, resolveUserNameFromRequest } from "./request-context";

describe("request-context", () => {
  it("does not assign an implicit system user when identity is absent", () => {
    expect(resolveUserNameFromRequest({})).toBe("");
  });

  it("resolves a username from the legacy entry query", () => {
    expect(resolveUserNameFromRequest({ query: "1471" })).toBe("1471");
  });

  it("keeps system as the background-task context outside a request", () => {
    expect(RequestContext.getUserName()).toBe("system");
  });
});

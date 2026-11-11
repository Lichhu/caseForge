import { RequestContext } from "./request-context";

describe("request-context", () => {
  it("keeps system as the background-task context outside a request", () => {
    expect(RequestContext.getUserName()).toBe("system");
  });
});

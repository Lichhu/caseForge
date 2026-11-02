import { ForbiddenException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import { ScenarioService } from "./scenario.service";

function makeService(options?: { isDispatcher?: boolean }) {
  const scenario = {
    id: "scenario-1",
    name: "接口场景",
    description: "说明",
    category: "功能",
    generationKey: "required_fields",
    scope: "api",
    isActive: true,
    createdBy: "system",
    prompts: [],
  };
  const scenarioRepo = {
    find: jest.fn().mockResolvedValue([scenario]),
    findOne: jest.fn().mockResolvedValue(scenario),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    softRemove: jest.fn(),
  };
  const promptRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    softDelete: jest.fn(),
  };
  const dispatcherRepo = {
    exists: jest.fn().mockResolvedValue(options?.isDispatcher ?? false),
  };
  const service = new ScenarioService(
    scenarioRepo as never,
    promptRepo as never,
    dispatcherRepo as never,
  );
  return { service, scenarioRepo, promptRepo, dispatcherRepo };
}

describe("ScenarioService API configuration permissions", () => {
  it("allows every user to read API scenarios", async () => {
    const { service } = makeService();

    const result = await RequestContext.run("viewer", () =>
      service.listScenarios("api"),
    );

    expect(result).toHaveLength(1);
    expect(result[0].generationKey).toBe("required_fields");
  });

  it("rejects API scenario creation by non-dispatchers", async () => {
    const { service, scenarioRepo } = makeService();

    await expect(
      RequestContext.run("viewer", () =>
        service.createScenario({
          name: "新场景",
          description: "",
          category: "功能",
          scope: "api",
          isActive: true,
          prompts: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scenarioRepo.save).not.toHaveBeenCalled();
  });

  it("rejects API prompt edits by non-dispatchers", async () => {
    const { service, scenarioRepo } = makeService();

    await expect(
      RequestContext.run("viewer", () =>
        service.updateScenario("scenario-1", {
          name: "修改后",
          description: "修改",
          category: "功能",
          isActive: true,
          prompts: [],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(scenarioRepo.save).not.toHaveBeenCalled();
  });
});

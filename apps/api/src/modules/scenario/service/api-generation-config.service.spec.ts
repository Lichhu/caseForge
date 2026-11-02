import { ForbiddenException } from "@nestjs/common";
import { RequestContext } from "@common/audit/request-context";
import { ApiGenerationConfigService } from "./api-generation-config.service";

function makeService(options?: { isDispatcher?: boolean }) {
  const property = {
    id: "property-1",
    code: "management_non_accounting",
    name: "管理类非涉账",
    description: "管理类",
    scenarioIds: ["scenario-2", "scenario-1"],
    sortOrder: 1,
    isActive: true,
    createdAt: new Date("2026-10-30T00:00:00.000Z"),
    updatedAt: new Date("2026-10-30T00:00:00.000Z"),
  };
  const scenarios = [
    {
      id: "scenario-1",
      name: "必填参数校验",
      description: "必填",
      category: "功能",
      generationKey: "required_fields",
      scope: "api",
      isActive: true,
      prompts: [
        {
          id: "prompt-1",
          scenarioId: "scenario-1",
          name: "必填字段缺失",
          content: "验证必填字段",
          tags: ["反向"],
          usageCount: 0,
          sortOrder: 1,
          isSystem: true,
          isActive: true,
          isDefault: true,
        },
      ],
    },
    {
      id: "scenario-2",
      name: "正向流程",
      description: "正向",
      category: "通用规则",
      generationKey: "positive_flow",
      scope: "api",
      isActive: true,
      prompts: [],
    },
  ];
  const propertyRepo = {
    find: jest.fn().mockResolvedValue([property]),
    findOne: jest.fn().mockResolvedValue(property),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    softDelete: jest.fn(),
  };
  const scenarioRepo = {
    find: jest.fn().mockResolvedValue(scenarios),
    count: jest.fn().mockResolvedValue(2),
  };
  const dispatcherRepo = {
    exists: jest.fn().mockResolvedValue(options?.isDispatcher ?? true),
  };
  const service = new ApiGenerationConfigService(
    propertyRepo as never,
    scenarioRepo as never,
    dispatcherRepo as never,
  );
  return { service, propertyRepo, scenarioRepo, dispatcherRepo };
}

describe("ApiGenerationConfigService", () => {
  it("returns service properties and the mapped API scenarios", async () => {
    const { service } = makeService();

    const result = await RequestContext.run("alice", () =>
      service.listConfig(),
    );

    expect(result.canEdit).toBe(true);
    expect(result.rows[0]).toMatchObject({
      code: "management_non_accounting",
      scenarioIds: ["scenario-2", "scenario-1"],
    });
    expect(result.scenarios.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining(["scenario-1", "scenario-2"]),
    );
  });

  it("resolves mapped scenarios for a generation profile", async () => {
    const { service } = makeService();

    const result = await service.resolveForGeneration(
      "management_non_accounting",
    );

    expect(result.property.name).toBe("管理类非涉账");
    expect(result.scenarios.map((scenario) => scenario.generationKey)).toEqual([
      "positive_flow",
      "required_fields",
    ]);
  });

  it("blocks non-dispatchers from changing service properties", async () => {
    const { service } = makeService({ isDispatcher: false });

    await expect(
      RequestContext.run("alice", () =>
        service.create({
          code: "custom",
          name: "自定义属性",
          description: "",
          scenarioIds: ["scenario-1"],
          sortOrder: 9,
          isActive: true,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows dispatchers to save mapped service properties", async () => {
    const { service, propertyRepo, scenarioRepo } = makeService();
    propertyRepo.findOne.mockResolvedValueOnce(null);
    scenarioRepo.count.mockResolvedValueOnce(1);

    const result = await RequestContext.run("alice", () =>
      service.create({
        code: "custom_property",
        name: "自定义属性",
        description: "说明",
        scenarioIds: ["scenario-1", "scenario-1"],
        sortOrder: 9,
        isActive: true,
      }),
    );

    expect(result).toMatchObject({
      code: "custom_property",
      scenarioIds: ["scenario-1"],
    });
    expect(propertyRepo.save).toHaveBeenCalled();
  });
});

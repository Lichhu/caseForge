import { FindOperator } from "typeorm";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";
import { CaseEditorService } from "./case-editor.service";

type MockManager = {
  create: jest.Mock;
  save: jest.Mock;
  insert: jest.Mock;
  find: jest.Mock;
  delete: jest.Mock;
  softDelete: jest.Mock;
};

function createService() {
  const manager: MockManager = {
    create: jest.fn((_entity, data) => ({
      ...data,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })),
    save: jest.fn(async (_entity, value) => value),
    insert: jest.fn(async () => ({ identifiers: [] })),
    find: jest.fn(async () => []),
    delete: jest.fn(async () => ({ affected: 1 })),
    softDelete: jest.fn(async () => ({ affected: 1 })),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const caseEditorRepo = {
    findOne: jest.fn(),
  };
  const projectRepo = {
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const service = new CaseEditorService(
    caseEditorRepo as never,
    {} as never,
    projectRepo as never,
    dataSource as never,
  );
  return { service, manager, caseEditorRepo, projectRepo };
}

const tree = {
  id: "root-1",
  title: "案例树",
  kind: "root" as const,
  children: [
    {
      id: "case-1",
      title: "案例 1",
      kind: "case" as const,
      children: [],
    },
  ],
};

describe("CaseEditorService hard delete", () => {
  it("physically removes previous runs' case trees when creating a new run", async () => {
    const { service, manager } = createService();

    await service.createRun({ projectId: "project-1", tree });

    const editor = manager.create.mock.results[0]?.value as CaseEditorEntity;
    const treeDelete = manager.delete.mock.calls.find(
      ([entity]) => entity === CaseTreeEntity,
    );
    expect(treeDelete).toBeDefined();

    const criteria = treeDelete?.[1] as {
      projectId: string;
      caseEditorId: FindOperator<string>;
    };
    expect(criteria.projectId).toBe("project-1");
    expect(criteria.caseEditorId.type).toBe("not");
    expect(criteria.caseEditorId.value).toBe(editor.id);
    expect(
      manager.softDelete.mock.calls.some(
        ([entity]) => entity === CaseTreeEntity,
      ),
    ).toBe(false);
  });

  it("physically replaces the tree when a save triggers full replacement", async () => {
    const { service, manager, caseEditorRepo } = createService();
    const editor = {
      id: "run-1",
      projectId: "project-1",
      caseTreeId: "root-1",
      version: 1,
      title: "案例树",
      prompt: "",
      model: "test",
      status: "completed",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    caseEditorRepo.findOne.mockResolvedValue(editor);

    await service.updateRunTree("project-1", "run-1", tree);

    expect(manager.delete).toHaveBeenCalledWith(CaseTreeEntity, {
      caseEditorId: "run-1",
    });
    expect(
      manager.softDelete.mock.calls.some(
        ([entity]) => entity === CaseTreeEntity,
      ),
    ).toBe(false);
  });
});

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Response } from "express";
import { CaseEditorController } from "./case-editor.controller";

describe("CaseEditorController export", () => {
  function createController() {
    const tree = { id: "root", title: "案例树", children: [] };
    const caseEditorService = {
      getRun: jest.fn().mockResolvedValue({
        tree,
        mindMapExtras: { summaries: [] },
      }),
    };
    const exporter = {
      toExcel: jest.fn().mockResolvedValue(Buffer.from("xlsx")),
      toXmind: jest.fn().mockResolvedValue(Buffer.from("xmind")),
      toExcelTemplate: jest.fn().mockReturnValue(Buffer.from("template")),
    };
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;
    const controller = new CaseEditorController(
      caseEditorService as never,
      {} as never,
      exporter as never,
    );
    return { controller, exporter, response, tree };
  }

  it("uses POST so a large caseNodeIds list stays out of the URL", () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        CaseEditorController.prototype.exportRun,
      ),
    ).toBe("projects/:projectId/runs/:runId/export");
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        CaseEditorController.prototype.exportRun,
      ),
    ).toBe(RequestMethod.POST);
  });

  it("forwards more than 200 selected case ids from the request body", async () => {
    const { controller, exporter, response, tree } = createController();
    const caseNodeIds = Array.from(
      { length: 250 },
      (_, index) => `case-${index}`,
    );

    await controller.exportRun(
      "project-1",
      "run-1",
      { format: "excel", caseNodeIds },
      response,
    );

    expect(exporter.toExcel).toHaveBeenCalledWith(tree, caseNodeIds);
    expect(response.send).toHaveBeenCalledWith(Buffer.from("xlsx"));
  });
});

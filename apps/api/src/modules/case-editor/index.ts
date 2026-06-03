/**
 * 案例编辑器 NestJS 模块：注册实体、服务与 HTTP 控制器，
 * 并导出 CaseEditorService、CaseWorkspaceService 供其他模块复用。
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiWorkflowModule } from "../../common/ai-workflow";
import { MinioStorageModule } from "@minio/index";
import { ProjectManageModule } from "@project-manage/index";
import { CaseConstraintEntity } from "./entity/case-constraint.entity";
import { CaseEditorEntity } from "./entity/case-editor.entity";
import { CaseNodeMetadataEntity } from "./entity/case-node-metadata.entity";
import { CaseTreeEntity } from "./entity/case-tree.entity";
import { CaseEditorController } from "./controller/case-editor.controller";
import { CaseEditorService } from "./service/case-editor.service";
import { CasePipelineService } from "./service/case-pipeline.service";
import { CaseWorkspaceService } from "./service/case-workspace.service";
import { ExportService } from "./service/export.service";
import { TestPointInstructEntity } from "@dynamic-instruct/entity/test-point-instruct.entity";
import { TestPointPromptEntity } from "@dynamic-instruct/entity/test-point-prompt.entity";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseEditorEntity,
      CaseTreeEntity,
      CaseNodeMetadataEntity,
      CaseConstraintEntity,
      CaseProjectEntity,
      StructDocEntity,
      TestPointEntity,
      TestPointInstructEntity,
      TestPointPromptEntity,
    ]),
    ProjectManageModule,
    AiWorkflowModule,
    MinioStorageModule,
  ],
  controllers: [CaseEditorController],
  providers: [
    CaseEditorService,
    CaseWorkspaceService,
    CasePipelineService,
    ExportService,
  ],
  exports: [CaseEditorService, CaseWorkspaceService],
})
export class CaseEditorModule {}

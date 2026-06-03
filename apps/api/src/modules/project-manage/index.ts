/**
 * @file 项目管理 Nest 模块
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseEditorEntity } from "@case-editor/entity/case-editor.entity";
import { CaseNodeMetadataEntity } from "@case-editor/entity/case-node-metadata.entity";
import { CaseTreeEntity } from "@case-editor/entity/case-tree.entity";
import { StructDocEntity } from "@struct-doc/entity/struct-doc.entity";
import { TestPointEntity } from "@struct-doc/entity/test-point.entity";
import { ProjectManageController } from "./controller/project-manage.controller";
import { ProjectManageService } from "./service/project-manage.service";
import { CaseProjectEntity } from "./entity/project.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CaseProjectEntity,
      CaseEditorEntity,
      StructDocEntity,
      TestPointEntity,
      CaseTreeEntity,
      CaseNodeMetadataEntity,
    ]),
  ],
  controllers: [ProjectManageController],
  providers: [ProjectManageService],
  exports: [ProjectManageService],
})
/** 项目管理功能模块 */
export class ProjectManageModule {}

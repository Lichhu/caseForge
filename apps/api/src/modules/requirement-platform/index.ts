/**
 * @file 需求平台模块：接口测试需求分发与认领
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { TestPlatformModule } from "@common/test-platform";
import { NotifyModule } from "@common/notify";
import { ApiTestModule } from "@api-test/index";
import { RequirementPlatformController } from "./controller/requirement-platform.controller";
import { ApiRequirementEntity } from "./entity/api-requirement.entity";
import { ApiRequirementDispatcherEntity } from "./entity/api-requirement-dispatcher.entity";
import { RequirementPlatformService } from "./service/requirement-platform.service";
import { RequirementSyncService } from "./service/requirement-sync.service";
import { RequirementNotifyService } from "./service/requirement-notify.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiRequirementEntity,
      ApiRequirementDispatcherEntity,
      CaseProjectEntity,
    ]),
    TestPlatformModule,
    ApiTestModule,
    NotifyModule,
  ],
  controllers: [RequirementPlatformController],
  providers: [
    RequirementPlatformService,
    RequirementSyncService,
    RequirementNotifyService,
  ],
  exports: [RequirementPlatformService, RequirementSyncService],
})
export class RequirementPlatformModule {}

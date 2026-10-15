/**
 * @file 需求平台模块：接口测试需求分发与认领
 */
import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CaseProjectEntity } from "@project-manage/entity/project.entity";
import { TestPlatformModule } from "@common/test-platform";
import { TestPlatformProjectEntity } from "@common/test-platform/entity/test-platform-project.entity";
import { TEST_PLATFORM_CONNECTION } from "@common/test-platform";
import { NotifyModule } from "@common/notify";
import { ApiTestModule } from "@api-test/index";
import { RequirementPlatformController } from "./controller/requirement-platform.controller";
import { ApiRequirementEntity } from "./entity/api-requirement.entity";
import { ApiRequirementDispatcherEntity } from "./entity/api-requirement-dispatcher.entity";
import { ApiRequirementMemberEntity } from "./entity/api-requirement-member.entity";
import { RequirementPlatformService } from "./service/requirement-platform.service";
import { RequirementSyncService } from "./service/requirement-sync.service";
import { RequirementNotifyService } from "./service/requirement-notify.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiRequirementEntity,
      ApiRequirementDispatcherEntity,
      ApiRequirementMemberEntity,
      CaseProjectEntity,
    ]),
    TypeOrmModule.forFeature([TestPlatformProjectEntity], TEST_PLATFORM_CONNECTION),
    TestPlatformModule,
    forwardRef(() => ApiTestModule),
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

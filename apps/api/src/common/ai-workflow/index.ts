/**
 * @file AI Chat + Skill Nest 模块
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createConfigProvider } from "@config/config-provider.util";
import {
  AI_WORKFLOW_CONFIG,
  createAiWorkflowConfig,
} from "./ai-workflow.config";
import { AiTokenUsageEntity } from "./entity/ai-token-usage.entity";
import { AiTokenUsageService } from "./service/ai-token-usage.service";
import { AiWorkflowService } from "./service/ai-workflow.service";

@Module({
  imports: [TypeOrmModule.forFeature([AiTokenUsageEntity])],
  providers: [
    createConfigProvider(AI_WORKFLOW_CONFIG, createAiWorkflowConfig),
    AiWorkflowService,
    AiTokenUsageService,
  ],
  exports: [AI_WORKFLOW_CONFIG, AiWorkflowService, AiTokenUsageService],
})
/** AI Chat 与 Skill 集成模块 */
export class AiWorkflowModule {}

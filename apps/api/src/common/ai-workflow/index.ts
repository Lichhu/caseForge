/**
 * @file AI Workflow Nest 模块
 */
import { Module } from "@nestjs/common";
import { createConfigProvider } from "@config/config-provider.util";
import {
  AI_WORKFLOW_CONFIG,
  createAiWorkflowConfig,
} from "./ai-workflow.config";
import { AiWorkflowService } from "./service/ai-workflow.service";
import { DifyWorkflowService } from "./service/dify-workflow.service";

@Module({
  providers: [
    createConfigProvider(AI_WORKFLOW_CONFIG, createAiWorkflowConfig),
    DifyWorkflowService,
    AiWorkflowService,
  ],
  exports: [AI_WORKFLOW_CONFIG, AiWorkflowService],
})
/** AI Workflow 集成模块 */
export class AiWorkflowModule {}

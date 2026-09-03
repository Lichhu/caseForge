/**
 * @file 消息通知模块：消息先落库 notify_message（默认未发送），再轮询推送
 * 当前推送通道为行内 OCU 敏行消息，业务模块只需调用 NotifyMessageService.enqueue
 */
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotifyMessageEntity } from "./entity/notify-message.entity";
import { NotifyMessageService } from "./service/notify-message.service";
import { OcuPushService } from "./service/ocu-push.service";

@Module({
  imports: [TypeOrmModule.forFeature([NotifyMessageEntity])],
  providers: [NotifyMessageService, OcuPushService],
  exports: [NotifyMessageService],
})
/** 消息落库与推送模块 */
export class NotifyModule {}

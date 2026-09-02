/**
 * @file 软删除基类，提供 deletedAt 字段
 * 所有需要支持逻辑删除的 Entity 应继承此类
 */
import { DeleteDateColumn } from "typeorm";

export abstract class SoftDeletableEntity {
  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deletedAt: Date | null;
}

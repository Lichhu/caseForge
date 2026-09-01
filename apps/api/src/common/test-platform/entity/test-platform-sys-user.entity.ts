/**
 * 测管平台用户表 sys_user（只映射需求平台分发所需字段）
 */
import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("sys_user")
export class TestPlatformSysUserEntity {
  @PrimaryGeneratedColumn({ name: "user_id", type: "bigint" })
  id: string;

  /** 账号 */
  @Column({ name: "user_name", type: "varchar", length: 50 })
  userName: string;

  /** 姓名 */
  @Column({ name: "nick_name", type: "varchar", length: 50 })
  nickName: string;

  /** 状态：0 正常 */
  @Column({ name: "status", type: "char", length: 1 })
  status: string;

  /** 删除标志：0 存在 */
  @Column({ name: "del_flag", type: "char", length: 1 })
  delFlag: string;
}

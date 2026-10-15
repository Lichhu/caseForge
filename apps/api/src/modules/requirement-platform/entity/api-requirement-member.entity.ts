import { SoftDeletableEntity } from "@common/entity/soft-deletable.entity";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("api_requirement_member")
@Index("uk_api_requirement_member_user", ["userName"], { unique: true, where: "deleted_at IS NULL" })
export class ApiRequirementMemberEntity extends SoftDeletableEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userName: string;

  @Column({ type: "varchar", nullable: true })
  remark?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

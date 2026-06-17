import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import {
  SCENARIO_SCOPE_API,
  SCENARIO_SCOPE_CASE,
  type ScenarioScope,
} from "@case-forge/shared";

export class ListScenariosQueryDto {
  @ApiPropertyOptional({ enum: [SCENARIO_SCOPE_CASE, SCENARIO_SCOPE_API] })
  @IsOptional()
  @IsString()
  @IsIn([SCENARIO_SCOPE_CASE, SCENARIO_SCOPE_API])
  scope?: ScenarioScope;
}

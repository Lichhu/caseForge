import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  BUSINESS_CODE_PATTERN,
  DISPLAY_NAME_HINT,
  INPUT_LIMITS,
  SAFE_DISPLAY_NAME_PATTERN,
} from "@case-forge/shared";

class ApiDocChannelDto {
  @IsString()
  @IsNotEmpty({ message: "渠道标识不能为空" })
  @MaxLength(INPUT_LIMITS.requirementCode)
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "渠道标识仅支持字母、数字、点、下划线和连字符",
  })
  id!: string;
  @IsString()
  @IsNotEmpty({ message: "渠道名称不能为空" })
  @MaxLength(INPUT_LIMITS.environmentName)
  @Matches(SAFE_DISPLAY_NAME_PATTERN, {
    message: `渠道名称${DISPLAY_NAME_HINT}`,
  })
  name!: string;
  @IsString()
  @IsNotEmpty({ message: "clientCd 不能为空" })
  @MaxLength(64)
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "clientCd 仅支持字母、数字、点、下划线和连字符",
  })
  clientCd!: string;
  @IsString()
  @IsNotEmpty({ message: "serviceCd 不能为空" })
  @MaxLength(64)
  @Matches(BUSINESS_CODE_PATTERN, {
    message: "serviceCd 仅支持字母、数字、点、下划线和连字符",
  })
  serviceCd!: string;
}

export class SaveApiDocGenerationDto {
  @ApiProperty({ example: "query_non_accounting" })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/)
  serviceProperty!: string;

  @IsIn(["http", "socket"])
  transport!: "http" | "socket";

  @IsIn(["json", "xml", "text"])
  messageFormat!: "json" | "xml" | "text";

  @IsString()
  @IsNotEmpty()
  @MaxLength(INPUT_LIMITS.exampleMessage, {
    message: "示例报文不能超过 2MB",
  })
  exampleMessage!: string;

  @IsArray()
  @ArrayUnique((channel: ApiDocChannelDto) => channel.id)
  @ValidateNested({ each: true })
  @Type(() => ApiDocChannelDto)
  channels!: ApiDocChannelDto[];
}

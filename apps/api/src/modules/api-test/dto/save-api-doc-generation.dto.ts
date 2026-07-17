import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { API_SERVICE_PROPERTIES } from "@case-forge/shared";

class ApiDocChannelDto {
  @IsString() @IsNotEmpty({ message: "渠道标识不能为空" }) id!: string;
  @IsString() @IsNotEmpty({ message: "渠道名称不能为空" }) name!: string;
  @IsString() @IsNotEmpty({ message: "clientCd 不能为空" }) clientCd!: string;
  @IsString() @IsNotEmpty({ message: "serviceCd 不能为空" }) serviceCd!: string;
}

export class SaveApiDocGenerationDto {
  @ApiProperty({ enum: API_SERVICE_PROPERTIES })
  @IsIn(API_SERVICE_PROPERTIES)
  serviceProperty!: (typeof API_SERVICE_PROPERTIES)[number];

  @IsIn(["http", "socket"])
  transport!: "http" | "socket";

  @IsIn(["json", "xml", "text"])
  messageFormat!: "json" | "xml" | "text";

  @IsString()
  @IsNotEmpty()
  exampleMessage!: string;

  @IsArray()
  @ArrayUnique((channel: ApiDocChannelDto) => channel.id)
  @ValidateNested({ each: true })
  @Type(() => ApiDocChannelDto)
  channels!: ApiDocChannelDto[];
}

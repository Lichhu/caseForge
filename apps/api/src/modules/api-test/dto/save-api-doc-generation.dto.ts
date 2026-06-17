import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class SaveApiDocGenerationDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  promptIds!: string[];
}

import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class SaveApiTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

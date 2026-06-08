import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class SaveApiTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/** 统一认证平台回调参数，保持第三方字段名不变。 */
export class SsoCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "票据" })
  ticket: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "服务器IP" })
  serverip: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "URL端口" })
  urlport: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "Socket端口" })
  socketport: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "URL路径" })
  urlpath: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "应用ID" })
  appid: string;
}

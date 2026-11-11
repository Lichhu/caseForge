import { IsNotEmpty, IsString } from "class-validator";

/** 统一认证平台回调参数，保持第三方字段名不变。 */
export class SsoCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  ticket: string;

  @IsString()
  @IsNotEmpty()
  serverip: string;

  @IsString()
  @IsNotEmpty()
  urlport: string;

  @IsString()
  @IsNotEmpty()
  socketport: string;

  @IsString()
  @IsNotEmpty()
  urlpath: string;

  @IsString()
  @IsNotEmpty()
  appid: string;
}

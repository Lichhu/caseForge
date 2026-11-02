import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SaveServicePropertyDto } from "../dto/save-service-property.dto";
import { ApiGenerationConfigService } from "../service/api-generation-config.service";

@ApiTags("api-generation-config")
@Controller("api-generation-config")
export class ApiGenerationConfigController {
  constructor(
    private readonly configService: ApiGenerationConfigService,
  ) {}

  @Get("service-properties")
  list() {
    return this.configService.listConfig();
  }

  @Post("service-properties")
  create(@Body() dto: SaveServicePropertyDto) {
    return this.configService.create(dto);
  }

  @Patch("service-properties/:id")
  update(@Param("id") id: string, @Body() dto: SaveServicePropertyDto) {
    return this.configService.update(id, dto);
  }

  @Delete("service-properties/:id")
  remove(@Param("id") id: string) {
    return this.configService.remove(id);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ManualPayload, ManualService } from './manual.service';

/**
 * 使用手册公开读取（t13）：GET /api/manual
 *
 * 与扩展配置端点同策略——不加 Guard，未登录也能看，方便同事在安装助手前先读手册。
 */
@Controller('manual')
export class ManualController {
  constructor(private readonly manualService: ManualService) {}

  @Get()
  read(): ManualPayload {
    return this.manualService.read();
  }
}

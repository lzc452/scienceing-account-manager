import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './lib/request-context';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // 反代（vite dev / 生产网关/nginx）位于回环地址：仅信任回环来源的 X-Forwarded-For，
  // 使 req.ip 反映真实客户端地址；非回环直接访问时伪造头不会被采纳（安全）。
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.use(requestContextMiddleware);
  app.enableCors({ origin: true, credentials: true });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] scienceing-server listening on http://localhost:${port}/api`);
}

void bootstrap();

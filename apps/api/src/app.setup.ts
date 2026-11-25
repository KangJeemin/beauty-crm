import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/** main.ts 와 e2e 테스트가 똑같은 설정을 쓰도록 분리 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  // 회사 서버 앞단 리버스 프록시(Caddy/Nginx)의 X-Forwarded-For 를 신뢰 → 실제 IP 기준으로 로그인 횟수 제한
  (app as NestExpressApplication).set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true, // Refresh Token 쿠키 주고받기
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // body 에 shopId 같은 정의되지 않은 필드가 오면 400
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableShutdownHooks();
}

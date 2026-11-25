import { ApiErrorBody, ErrorCode } from '@beauty-crm/shared';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** 모든 에러를 { success:false, statusCode, code, message } 형태로 통일 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): ApiErrorBody {
    if (e instanceof ThrottlerException) {
      return { success: false, statusCode: 429, code: ErrorCode.TOO_MANY_REQUESTS, message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse() as any;
      if (r && typeof r === 'object' && r.code) {
        return { success: false, statusCode: status, code: r.code, message: r.message };
      }
      // ValidationPipe: message 가 배열
      if (r && Array.isArray(r.message)) {
        return { success: false, statusCode: status, code: ErrorCode.VALIDATION, message: r.message[0], details: r.message };
      }
      const code =
        status === 401 ? ErrorCode.UNAUTHORIZED :
        status === 403 ? ErrorCode.FORBIDDEN :
        status === 404 ? ErrorCode.NOT_FOUND :
        status === 400 ? ErrorCode.VALIDATION : ErrorCode.INTERNAL;
      return { success: false, statusCode: status, code, message: (r && r.message) || e.message };
    }
    // 소프트 삭제 + activeKey UNIQUE 충돌
    if (e instanceof QueryFailedError && (e as any).code === 'ER_DUP_ENTRY') {
      return { success: false, statusCode: HttpStatus.CONFLICT, code: ErrorCode.DUPLICATE, message: '이미 등록된 데이터입니다.' };
    }
    return { success: false, statusCode: 500, code: ErrorCode.INTERNAL, message: '서버 오류가 발생했습니다.' };
  }
}

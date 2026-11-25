import { ApiResponse } from '@beauty-crm/shared';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** 모든 성공 응답을 { success: true, data } 형태로 감싼다. 파일 스트림(녹음 다시 듣기)은 그대로 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | StreamableFile> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | StreamableFile> {
    return next.handle().pipe(map((data) => (data instanceof StreamableFile ? data : { success: true, data })));
  }
}

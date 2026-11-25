import { ErrorCode } from '@beauty-crm/shared';
import { HttpException, HttpStatus } from '@nestjs/common';

/** 화면에서 분기 가능한 code 를 함께 내려주는 예외 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppException(ErrorCode.INVALID_CREDENTIALS, '아이디 또는 비밀번호가 올바르지 않습니다.', HttpStatus.UNAUTHORIZED),
  unauthorized: (msg = '로그인이 필요합니다.') => new AppException(ErrorCode.UNAUTHORIZED, msg, HttpStatus.UNAUTHORIZED),
  forbidden: (msg = '권한이 없습니다.') => new AppException(ErrorCode.FORBIDDEN, msg, HttpStatus.FORBIDDEN),
  notFound: (what = '데이터') => new AppException(ErrorCode.NOT_FOUND, `${what}를 찾을 수 없습니다.`, HttpStatus.NOT_FOUND),
  loginIdTaken: () => new AppException(ErrorCode.LOGIN_ID_TAKEN, '이미 사용 중인 아이디입니다.', HttpStatus.CONFLICT),
  shopPending: () =>
    new AppException(ErrorCode.SHOP_PENDING, '매장 가입 승인 대기 중입니다. 승인되면 로그인할 수 있습니다.', HttpStatus.FORBIDDEN),
  shopSuspended: () =>
    new AppException(ErrorCode.SHOP_SUSPENDED, '이용이 정지된 매장입니다. 고객센터로 문의해 주세요.', HttpStatus.FORBIDDEN),
  userLocked: () =>
    new AppException(ErrorCode.USER_LOCKED, '잠긴 계정입니다. 원장님께 문의해 주세요.', HttpStatus.FORBIDDEN),
  inviteInvalid: () =>
    new AppException(ErrorCode.INVITE_INVALID, '초대 코드가 없거나 만료되었습니다.', HttpStatus.BAD_REQUEST),
};

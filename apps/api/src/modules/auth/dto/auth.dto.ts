import { AuthRules } from '@beauty-crm/shared';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const LOGIN_ID = new RegExp(AuthRules.loginIdPattern);
const PASSWORD = new RegExp(AuthRules.passwordPattern);
const PHONE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

export class LoginDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해 주세요.' })
  loginId: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  password: string;
}

class NewAccountFields {
  @Transform(trim)
  @Matches(LOGIN_ID, { message: AuthRules.loginIdMessage })
  loginId: string;

  @IsString()
  @Matches(PASSWORD, { message: AuthRules.passwordMessage })
  password: string;

  @IsOptional()
  @Transform(trim)
  @Matches(PHONE, { message: '휴대폰 번호 형식이 올바르지 않습니다.' })
  phone?: string;
}

export class SignupDto extends NewAccountFields {
  @Transform(trim)
  @Length(1, 100, { message: '매장 이름을 입력해 주세요.' })
  shopName: string;

  @Transform(trim)
  @Length(1, 50, { message: '원장님 성함을 입력해 주세요.' })
  ownerName: string;

  @IsBoolean()
  @Equals(true, { message: '이용약관에 동의해 주세요.' })
  agreeTerms: boolean;

  @IsBoolean()
  @Equals(true, { message: '개인정보 처리방침에 동의해 주세요.' })
  agreePrivacy: boolean;
}

export class JoinByInviteDto extends NewAccountFields {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Length(6, 32, { message: '초대 코드를 확인해 주세요.' })
  inviteCode: string;

  @Transform(trim)
  @Length(1, 50, { message: '이름을 입력해 주세요.' })
  name: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '현재 비밀번호를 입력해 주세요.' })
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD, { message: '새 ' + AuthRules.passwordMessage })
  newPassword: string;
}

export class AdminLoginDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  loginId: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

import { UserStatus } from '@beauty-crm/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Length, Matches, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateStaffDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 50, { message: '이름을 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value))
  @Matches(/^0\d{1,2}-?\d{3,4}-?\d{4}$/, { message: '휴대폰 번호 형식이 올바르지 않습니다.' })
  phone?: string | null;

  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.LOCKED])
  status?: UserStatus;
}

export class UpdateMySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(80)
  @Max(150)
  fontScale?: number;

  @IsOptional()
  @Transform(trim)
  @Length(1, 50, { message: '이름을 입력해 주세요.' })
  name?: string;
}

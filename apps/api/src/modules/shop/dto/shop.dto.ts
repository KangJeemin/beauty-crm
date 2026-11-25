import { Transform } from 'class-transformer';
import { IsObject, IsOptional, Length, Matches, MaxLength } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) =>
  value === '' ? null : typeof value === 'string' ? value.trim() : value;

export class UpdateShopDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100, { message: '매장 이름을 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^0\d{1,2}-?\d{3,4}-?\d{4}$/, { message: '전화번호 형식이 올바르지 않습니다.' })
  phone?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @MaxLength(255)
  address?: string | null;

  /** {"mon":["10:00","20:00"], "tue":null(휴무), ...} */
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, [string, string] | null> | null;
}

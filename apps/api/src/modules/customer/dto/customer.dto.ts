import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value);

export class CustomerCreateDto {
  @Transform(trim)
  @Length(1, 50, { message: '고객 이름을 입력해 주세요.' })
  name: string;

  /** 숫자·하이픈 자유 입력 → 서버에서 정규화·검증 */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsIn(['F', 'M', null])
  gender?: 'F' | 'M' | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '출생연도는 숫자로 입력해 주세요.' })
  @Min(1900)
  @Max(2100)
  birthYear?: number | null;

  @IsOptional()
  @Transform(trimOrNull)
  @MaxLength(2000)
  memo?: string | null;

  /** 개인정보 수집·이용 동의를 받았는지 */
  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  tagIds?: number[];
}

export class CustomerUpdateDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 50, { message: '고객 이름을 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsIn(['F', 'M', null])
  gender?: 'F' | 'M' | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number | null;

  @IsOptional()
  @Transform(trimOrNull)
  @MaxLength(2000)
  memo?: string | null;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  tagIds?: number[];
}

export class CustomerListQuery {
  /** 뒷자리 4자리 · 전체 번호 · 이름 */
  @IsOptional()
  @Transform(trim)
  @MaxLength(50)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tagId?: number;

  @IsOptional()
  @IsIn(['recent', 'name', 'created'])
  sort?: 'recent' | 'name' | 'created';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class PhoneCheckQuery {
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone: string;

  /** 수정 화면에서 자기 자신은 제외 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  excludeId?: number;
}

import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value);

export class CategoryInputDto {
  @Transform(trim)
  @Length(1, 50, { message: '분류 이름을 입력해 주세요.' })
  name: string;
}

export class MenuCreateDto {
  @Type(() => Number)
  @IsInt()
  categoryId: number;

  @Transform(trim)
  @Length(1, 100, { message: '시술 이름을 입력해 주세요.' })
  name: string;

  @Type(() => Number)
  @IsInt({ message: '가격은 숫자로 입력해 주세요.' })
  @Min(0, { message: '가격은 0원 이상이어야 합니다.' })
  @Max(10_000_000)
  basePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMin?: number | null;

  @IsOptional()
  @Transform(trimOrNull)
  @MaxLength(255)
  aliases?: string | null;
}

export class MenuUpdateDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Transform(trim)
  @Length(1, 100, { message: '시술 이름을 입력해 주세요.' })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '가격은 숫자로 입력해 주세요.' })
  @Min(0)
  @Max(10_000_000)
  basePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMin?: number | null;

  @IsOptional()
  @Transform(trimOrNull)
  @MaxLength(255)
  aliases?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class OrderDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}

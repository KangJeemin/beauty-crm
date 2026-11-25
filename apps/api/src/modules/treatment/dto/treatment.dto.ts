import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value);

export class RecipeDto {
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50) area?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) productName?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50) colorCode?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50) mixRatio?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(99.9) developerPct?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(99999.9) amountGram?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) processingMin?: number | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(50) rodSize?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(300) heatTemp?: number | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) memo?: string | null;
}

export class TreatmentItemDto {
  @IsOptional() @IsInt() serviceMenuId?: number | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100, { message: '시술 이름을 입력해 주세요.' })
  menuName: string;

  @IsInt({ message: '금액은 숫자로 입력해 주세요.' })
  @Min(0)
  @Max(10_000_000)
  price: number;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RecipeDto)
  recipes: RecipeDto[];
}

export class TreatmentSaveDto {
  @IsInt({ message: '고객을 선택해 주세요.' })
  customerId: number;

  /** 담당 디자이너 (없으면 저장하는 사람) */
  @IsOptional() @IsInt() designerId?: number;

  @IsOptional() @IsDateString() treatedAt?: string;

  /** 음성/글 기록에서 왔으면 연결 */
  @IsOptional() @IsInt() voiceRecordId?: number | null;

  /** "지난번이랑 똑같이" 원본 */
  @IsOptional() @IsInt() copiedFromId?: number | null;

  @IsArray()
  @ArrayMaxSize(10, { message: '시술은 10개까지 입력할 수 있습니다.' })
  @ValidateNested({ each: true })
  @Type(() => TreatmentItemDto)
  items: TreatmentItemDto[];

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(2000) note?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) summary?: string | null;
}

export class TreatmentListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) size?: number;
}

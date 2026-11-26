import { PaymentMethod } from '@beauty-crm/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => (value === '' ? null : typeof value === 'string' ? value.trim() : value);
const METHODS: PaymentMethod[] = ['CARD', 'CASH', 'TRANSFER', 'PREPAID', 'ETC'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PaymentDetailDto {
  @IsIn(METHODS, { message: '결제수단을 확인해 주세요.' }) method: PaymentMethod;
  @IsInt({ message: '금액은 숫자로 입력해 주세요.' }) @Min(1, { message: '결제수단별 금액은 1원 이상이어야 합니다.' }) @Max(100_000_000) amount: number;
  @IsOptional() @IsInt() prepaidPassId?: number | null;
}

export class PaymentCreateDto {
  @IsOptional() @IsInt() treatmentId?: number | null;
  @IsOptional() @IsInt() customerId?: number | null;
  @IsOptional() @IsIn(['SERVICE', 'PRODUCT']) paymentType?: 'SERVICE' | 'PRODUCT';
  @IsInt() @Min(0) @Max(100_000_000) listAmount: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) discountAmount?: number;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) discountReason?: string | null;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PaymentDetailDto)
  details: PaymentDetailDto[];

  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) memo?: string | null;
}

export class PrepaidPassCreateDto {
  @IsInt({ message: '고객을 선택해 주세요.' }) customerId: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 100, { message: '선불권 이름을 입력해 주세요.' })
  passName: string;

  @IsInt() @Min(1, { message: '충전 금액을 입력해 주세요.' }) @Max(100_000_000) chargeAmount: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) bonusAmount?: number;
  @IsOptional() @Transform(trimOrNull) @Matches(DATE, { message: '유효기간 형식이 올바르지 않습니다.' }) expireAt?: string | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) memo?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: '결제수단을 입력해 주세요.' })
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PaymentDetailDto)
  details: PaymentDetailDto[];

  @IsOptional() @IsDateString() paidAt?: string;
}

export class PassAdjustDto {
  /** +적립 / -차감 */
  @IsInt() @Min(-100_000_000) @Max(100_000_000) amount: number;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 255, { message: '조정 사유를 입력해 주세요.' })
  memo: string;
}

export class PassRefundDto {
  /** 고객에게 돌려준 돈 (보너스 제외 등으로 잔액과 다를 수 있음, 0 이면 돈은 안 돌려주고 소멸) */
  @IsInt() @Min(0) @Max(100_000_000) refundAmount: number;
  @IsIn(['CARD', 'CASH', 'TRANSFER', 'ETC']) method: Exclude<PaymentMethod, 'PREPAID'>;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(255) memo?: string | null;
}

export class DateQuery {
  @IsOptional() @Matches(DATE, { message: '날짜 형식은 YYYY-MM-DD 입니다.' }) date?: string;
}

export class MonthQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/, { message: '월 형식은 YYYY-MM 입니다.' }) month?: string;
}

export class ClosingDto {
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) actualCash?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) actualCard?: number | null;
  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500) memo?: string | null;
}

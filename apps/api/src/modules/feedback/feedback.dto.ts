import { FeedbackCategory, FeedbackStatus } from '@beauty-crm/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class FeedbackCreateDto {
  @IsIn(Object.values(FeedbackCategory))
  category: FeedbackCategory;

  @Transform(trim)
  @IsString()
  @MinLength(2, { message: '내용을 두 글자 이상 적어 주세요.' })
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageUrl?: string | null;
}

export class FeedbackReplyDto {
  @IsOptional()
  @IsIn(Object.values(FeedbackStatus))
  status?: FeedbackStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reply?: string | null;
}

export class FeedbackListQuery {
  @IsOptional()
  @IsIn([...Object.values(FeedbackStatus), 'UNDONE'])
  status?: FeedbackStatus | 'UNDONE';
}

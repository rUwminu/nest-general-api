import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinDate,
  MinLength,
} from 'class-validator';
import { EventJoinPolicy } from '../../../../generated/prisma/client.js';

const MIN_LEAD_TIME_MINUTES = 5;

function minEventDate(): Date {
  return new Date(Date.now() + MIN_LEAD_TIME_MINUTES * 60 * 1000);
}

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @Type(() => Date)
  @IsDate()
  @MinDate(minEventDate, {
    message: `startsAt must be at least ${MIN_LEAD_TIME_MINUTES} minutes from now`,
  })
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  @MinDate(minEventDate, {
    message: `endsAt must be at least ${MIN_LEAD_TIME_MINUTES} minutes from now`,
  })
  endsAt: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsEnum(EventJoinPolicy)
  joinPolicy?: EventJoinPolicy = EventJoinPolicy.OPEN;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  inviteUserIds?: string[];
}

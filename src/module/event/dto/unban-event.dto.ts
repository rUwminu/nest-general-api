import { IsOptional, IsString, MinLength } from 'class-validator';

export class UnbanEventDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}

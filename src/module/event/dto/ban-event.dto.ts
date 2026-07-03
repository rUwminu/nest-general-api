import { IsString, MinLength } from 'class-validator';

export class BanEventDto {
  @IsString()
  @MinLength(3)
  reason: string;
}

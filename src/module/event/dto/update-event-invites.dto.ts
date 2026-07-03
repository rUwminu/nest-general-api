import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateEventInvitesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userIds: string[];
}

import { IsIn } from 'class-validator';

export class RespondEventInviteDto {
  @IsIn(['ACCEPTED', 'DECLINED'])
  status: 'ACCEPTED' | 'DECLINED';
}

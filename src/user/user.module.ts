import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { LoggerService } from './user.logger';

@Module({
  controllers: [UserController],
  providers: [UserService, LoggerService],
})
export class UserModule {}

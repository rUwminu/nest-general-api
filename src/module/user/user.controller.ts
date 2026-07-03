import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles, Session, UserSession } from '@thallesp/nestjs-better-auth';
import { UserService } from './user.service.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { auth } from '../../lib/auth/auth.js';
import { SearchUserDto } from './dto/search-user.dto.js';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('all')
  @Roles(['ADMIN'])
  @ResponseMessage('Fetch all users')
  findAll() {
    return this.userService.findAll();
  }

  @Get('search')
  search(
    @Query() query: SearchUserDto,
    @Session() session: UserSession<typeof auth>,
  ) {
    return this.userService.search(query.q, session.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }
}

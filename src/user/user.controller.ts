import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';
import { RoleGuard } from 'src/guards/role.guard';

@Controller('user')
// @UseGuards(RoleGuard) <- this for apply to all route in this folder
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getUsers(@Query('name') name: string): unknown {
    return this.userService.findAllUsers(name);
  }

  @Get(':id')
  getUserById(@Param('id', ParseIntPipe) id: number): unknown {
    return this.userService.findUserById(id);
  }

  @Post()
  createUser(@Body() CreateUserDto: CreateUserDto): unknown {
    return {
      data: this.userService.createUser(CreateUserDto),
      message: 'User created successful',
    };
  }

  @Put(':id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() UpdateUserDto: UpdateUserDto,
  ): unknown {
    return {
      data: this.userService.updateUser(id, UpdateUserDto),
      message: 'User updated successful',
    };
  }

  // DELETE /user/1 -> 401 -> header ROLE: ADMIN -> Go through
  @Delete(':id')
  @UseGuards(RoleGuard)
  deleteUserById(@Param('id', ParseIntPipe) id: number): unknown {
    return {
      data: this.userService.deleteUser(id),
      message: 'User deleted successful',
    };
  }
}

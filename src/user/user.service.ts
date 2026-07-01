import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoggerService } from './user.logger';

interface User {
  id: number;
  name: string;
  email: string;
}

@Injectable()
export class UserService {
  constructor(private readonly logger: LoggerService) {}

  private users: User[] = [
    { id: 1, name: 'Jane Doe', email: 'john@gmail.com' },
    { id: 2, name: 'Alex', email: 'alex@gmail.com' },
  ];

  findAllUsers(name: string = '') {
    this.logger.log('Finding all users');

    return this.users.filter((u) =>
      u.name.toLocaleLowerCase().includes(name.toLowerCase()),
    );
  }

  findUserById(id: number) {
    this.logger.log(`Finding users ${id}`);

    const user = this.users.find((u) => u.id === id);

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  createUser(data: CreateUserDto) {
    this.logger.log('Create user');

    this.users.push({
      id: 3,
      ...data,
    });

    return this.users;
  }

  updateUser(id: number, data: UpdateUserDto) {
    this.logger.log('Update user');

    const updatedUserArray = this.users.map((u) =>
      u.id === id
        ? {
            ...u,
            ...data,
          }
        : u,
    );

    return updatedUserArray;
  }

  deleteUser(id: number) {
    this.logger.log('Delete user');

    const findIdx = this.users.findIndex((u) => u.id === id);

    if (findIdx === -1) return null;

    const [del] = this.users.splice(findIdx, 1);

    return del;
  }
}

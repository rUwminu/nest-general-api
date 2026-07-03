import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../lib/database/prisma.service.js';

const SEARCH_RESULT_LIMIT = 10;

type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'image'>;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  search(query: string, excludeUserId: string): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, image: true },
      take: SEARCH_RESULT_LIMIT,
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
  }
}

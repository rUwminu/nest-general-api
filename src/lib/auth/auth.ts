import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../database/prisma.service.js';

// Better Auth must exist as a standalone singleton importable outside the
// Nest DI container: the @better-auth/cli schema generator loads this file
// directly, without ever bootstrapping Nest.
const prisma = new PrismaService();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        enum: ['PARTICIPANT', 'ADMIN'],
        defaultValue: 'PARTICIPANT',
        input: true,
      },
    },
  },
});

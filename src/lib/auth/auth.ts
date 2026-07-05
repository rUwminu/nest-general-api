import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../database/prisma.service.js';
import { getAllowedOrigins } from '../../common/utils/allowed-origins.js';

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
  // The Next.js frontend proxies /api/* here via rewrites; requests arrive
  // with the browser origin, which must be trusted or POSTs are rejected.
  trustedOrigins: getAllowedOrigins(),
  // The frontend stores the sign-in token itself and sends it as
  // `Authorization: Bearer <token>` instead of relying on the session cookie.
  plugins: [bearer()],
  user: {
    additionalFields: {
      role: {
        type: 'string',
        enum: ['USER', 'ADMIN'],
        defaultValue: 'USER',
        input: false,
      },
    },
  },
});

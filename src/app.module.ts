import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ArcjetGuard, ArcjetModule, fixedWindow, shield } from '@arcjet/nest';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './lib/database/prisma.module.js';
import { auth } from './lib/auth/auth.js';
import { UserModule } from './module/user/user.module.js';
import { EventModule } from './module/event/event.module.js';
import { NotificationModule } from './module/notification/notification.module.js';

const arcjetMode = process.env.ARCJET_MODE === 'DRY_RUN' ? 'DRY_RUN' : 'LIVE';

// Powershell cmd test shield
// 1..60 | ForEach-Object {
//   curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:5000
// }

@Module({
  imports: [
    ArcjetModule.forRoot({
      isGlobal: true,
      key: process.env.ARCJET_KEY!,
      rules: [
        shield({
          mode: arcjetMode,
        }),
        fixedWindow({
          mode: arcjetMode,
          window: '1m',
          max: 80,
        }),
      ],
    }),
    PrismaModule,
    AuthModule.forRoot({ auth }),
    UserModule,
    EventModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ArcjetGuard,
    },
  ],
})
export class AppModule {}

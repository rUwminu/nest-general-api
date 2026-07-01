import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  log(msg: string) {
    console.log('[LOG]', msg);
  }
}

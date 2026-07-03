import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  const createContext = () =>
    ({
      switchToHttp: () => ({ getResponse: () => ({ statusCode: 200 }) }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  const createCallHandler = (data: unknown) =>
    ({ handle: () => of(data) }) as CallHandler;

  it('wraps the response with statusCode, default message and data', (done) => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);

    interceptor
      .intercept(createContext(), createCallHandler({ id: 1 }))
      .subscribe((result) => {
        expect(result).toEqual({
          statusCode: 200,
          message: 'Success',
          data: { id: 1 },
        });
        done();
      });
  });

  it('uses the message set via @ResponseMessage when present', (done) => {
    const reflector = {
      getAllAndOverride: () => 'Custom message',
    } as unknown as Reflector;
    const interceptor = new TransformInterceptor(reflector);

    interceptor
      .intercept(createContext(), createCallHandler(null))
      .subscribe((result) => {
        expect(result.message).toBe('Custom message');
        done();
      });
  });
});

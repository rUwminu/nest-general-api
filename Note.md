Interceptor

- run logic before & after the controller
- it focus on result not error
- it help shaping consitant success response with data & meta data
- cmd for generate interceptor file
  - nest g interceptor utils/transform --flat

Pipe

- run before request reach the controller
- it transform the input to the right type & validate it
- example parse api param from string to int @Param('id', ParseIntPipe) id: number

Library for type validation

- class-validator & class-transformer
- at main.ts setup the validation
  - app.useGlobalPipes(new ValidationPipe());
- at table.dto file add validation to field
  - @IsEmail()
  - email!: string;
- tsconfig.json setup
  - module & moduleResolution change from nodenext > node16
  - resolvePackageJsonExports & isolatedModules comment it up

Middleware

- it run run before the request reach route handler
- to protect user route with only valid api key
- at app.module.ts setuo the middleware using implement & configure
- not good for:
  - Access control or roles and permission
- good for:
  - Logging auth
  - Request transformation
  - Global checks
- cmd for generate middleware file
  - nest g middleware middleware/api-key --flat

Guard

- it run after middleware
- it check the request should proceed
  - if true > call controller
  - if false > return error
- at user.controller.ts for example, pick a route to add the guard
  - or main.ts to apply to all route
- cmd for generate guard file
  - nest g guard guards/role --flat

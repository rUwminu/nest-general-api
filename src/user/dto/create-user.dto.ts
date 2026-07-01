import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsEmail()
  email!: string;
}

// [POST /user with { "name": 123, "email": "notemail" }]
// {
//  "message": [
//    "name must be longer than or equal to 3 characters",
//    "name must be a string",
//    "email must be an email"
//  ],
//  "error": "Bad Request",
//  "statusCode": 400
// }

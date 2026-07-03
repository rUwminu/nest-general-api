import { BadRequestException, ValidationError } from '@nestjs/common';

export interface ValidationErrorItem {
  property: string;
  message: string;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorItem[] {
  return errors.flatMap((error) => {
    const property = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const messages = error.constraints
      ? Object.values(error.constraints).map((message) => ({
          property,
          message,
        }))
      : [];

    const childErrors = error.children?.length
      ? flattenValidationErrors(error.children, property)
      : [];

    return [...messages, ...childErrors];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException(flattenValidationErrors(errors));
}

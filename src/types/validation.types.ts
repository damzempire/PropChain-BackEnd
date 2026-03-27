// Validation types for DTOs and forms
export interface ValidationRule<T = unknown> {
  field: string;
  validator: (value: T) => boolean;
  message: string;
  code: string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule[];
}

// Common validation constraints
export interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: string[];
  required?: boolean;
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
}

export interface NumberConstraints {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
  negative?: boolean;
  required?: boolean;
}

export interface ArrayConstraints {
  minLength?: number;
  maxLength?: number;
  unique?: boolean;
  required?: boolean;
}

export interface ObjectConstraints {
  required?: boolean;
  partial?: boolean;
  strict?: boolean;
}

// Custom validator types
export type CustomValidator<T = unknown> = (value: T, context?: ValidationContext) => boolean | Promise<boolean>;

export interface CustomValidationRule<T = unknown> {
  name: string;
  validator: CustomValidator<T>;
  message: string | ((value: T, context?: ValidationContext) => string);
  async?: boolean;
}

// Validation context
export interface ValidationContext {
  path: string;
  parent?: Record<string, unknown>;
  root?: Record<string, unknown>;
  options?: ValidationOptions;
}

export interface ValidationOptions {
  strict?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
  abortEarly?: boolean;
  convert?: boolean;
}

// Validation result types
export interface FieldError {
  path: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationErrorResult {
  isValid: false;
  errors: FieldError[];
  value: unknown;
}

export interface ValidationSuccessResult<T> {
  isValid: true;
  value: T;
  warnings?: FieldError[];
}

export type ValidationResult<T = unknown> = ValidationSuccessResult<T> | ValidationErrorResult;

// Type guards for validation results
export function isValidResult<T>(result: ValidationResult<T>): result is ValidationSuccessResult<T> {
  return result.isValid === true;
}

export function isInvalidResult<T>(result: ValidationResult<T>): result is ValidationErrorResult {
  return result.isValid === false;
}

// Common validation utilities
export interface EmailValidationOptions {
  allowUnicode?: boolean;
  ignoreLength?: boolean;
  multiple?: boolean;
  separator?: string;
}

export interface PasswordValidationOptions {
  minLength?: number;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  disallowCommonPasswords?: boolean;
}

export interface UrlValidationOptions {
  protocols?: string[];
  requireProtocol?: boolean;
  allowLocal?: boolean;
  allowDataUrl?: boolean;
}

export interface DateValidationOptions {
  format?: string;
  min?: Date | string;
  max?: Date | string;
  iso?: boolean;
}

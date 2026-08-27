export class ArgusError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 500,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends ArgusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'not_found', 404, cause);
  }
}

export class ValidationError extends ArgusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'validation_failed', 400, cause);
  }
}

export class AuthError extends ArgusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'auth_failed', 401, cause);
  }
}

export class ForbiddenError extends ArgusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'forbidden', 403, cause);
  }
}

export class ConflictError extends ArgusError {
  constructor(message: string, cause?: unknown) {
    super(message, 'conflict', 409, cause);
  }
}

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = () => new AppError(404, 'CREDITO_NOT_FOUND', 'El crédito no existe');

export const ok = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });

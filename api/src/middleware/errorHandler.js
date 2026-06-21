export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Centralized error responder. Keep last in the middleware chain.
export function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(err.details ? { details: err.details } : {}),
  });
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

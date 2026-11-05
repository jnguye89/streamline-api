import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** What a failed outgoing request (axios) carries, minus its config and headers. */
type OutgoingError = {
  config?: { method?: string; url?: string };
  response?: { status?: number; data?: unknown };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : ((exception as { status?: number })?.status ?? 500);
    const message =
      (exception as { message?: string })?.message || 'Unknown error';
    // Some errors carry a machine-readable code (e.g. "underage", "too_young_to_go_live") that
    // the apps use to pick the right message; pass it through.
    const code =
      exception instanceof HttpException
        ? (exception.getResponse() as { code?: unknown })?.code
        : undefined;

    this.log(
      exception,
      status,
      `${request?.method ?? ''} ${request?.url ?? ''}`.trim(),
    );

    response.status(status).json({
      statusCode: status,
      message,
      ...(typeof code === 'string' ? { code } : {}),
    });
  }

  /**
   * Expected refusals (4xx) get one line. Failed outgoing requests are logged by status and
   * body only: their config holds Authorization headers, like the Auth0 management token, which
   * must never end up in the logs.
   */
  private log(exception: unknown, status: number, where: string) {
    if (exception instanceof HttpException && status < 500) {
      console.warn(`${status} ${where}: ${exception.message}`);
      return;
    }
    const outgoing = exception as OutgoingError | null;
    if (outgoing?.response?.status && outgoing.config) {
      const target = `${outgoing.config.method?.toUpperCase() ?? ''} ${outgoing.config.url ?? ''}`;
      console.error(
        `Unhandled error on ${where}: ${target} failed with ${outgoing.response.status}`,
        outgoing.response.data,
      );
      return;
    }
    console.error(`Unhandled error on ${where}:`, exception);
  }
}

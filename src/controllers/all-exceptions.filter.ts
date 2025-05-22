import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();

    console.error('Unhandled error:', exception);

    const status = exception?.status || 500;
    response.status(status).json({
      statusCode: status,
      message: exception.message || 'Unknown error',
    });
  }
}

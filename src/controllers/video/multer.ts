import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import type { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    console.error('Caught Multer error:', exception.code);
    const response = host.switchToHttp().getResponse<Response>();
    response
      .status(413)
      .json({ message: 'Multer size limit hit', error: exception.code });
  }
}

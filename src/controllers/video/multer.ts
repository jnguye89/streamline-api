import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    console.error('Caught Multer error:', exception.code);
    const res = host.switchToHttp().getResponse();
    res
      .status(413)
      .json({ message: 'Multer size limit hit', error: exception.code });
  }
}
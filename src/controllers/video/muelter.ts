import { Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError) {
    console.error('Multer error:', exception.code);
    // returns LIMIT_FILE_SIZE if this is the issue
  }
}

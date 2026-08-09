import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorLog } from 'src/entity/error-log.entity';
import { Repository } from 'typeorm';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(ErrorLog)
    private readonly repository: Repository<ErrorLog>,
  ) {}

  async insertLog(message: string, errorSource?: string | null): Promise<void> {
    await this.repository.save({ message, errorSource });
  }
}

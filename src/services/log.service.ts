import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ErrorLog } from "src/entity/error-log";
import { Repository } from "typeorm";

@Injectable()
export class LogService {
    constructor(@InjectRepository(ErrorLog) private repo: Repository<ErrorLog>) { }

    async insertLog(message: string, errorSource?: string | null) {
        await this.repo.save({ message, errorSource });
    }
}
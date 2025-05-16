import { Module } from '@nestjs/common';
import { FirebaseService } from './../services/firebase.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}

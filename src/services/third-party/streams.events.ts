// streams/streams.events.ts
import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type StreamUpdate = {
  id: number;
  phase: string;
  wowzaState?: string;
  errorMessage?: string;
};

@Injectable()
export class StreamsEvents {
  private subjects = new Map<number, Subject<StreamUpdate>>();

  subjectFor(id: number): Subject<StreamUpdate> {
    if (!this.subjects.has(id)) this.subjects.set(id, new Subject<StreamUpdate>());
    return this.subjects.get(id)!;
  }

  emit(u: StreamUpdate) {
    this.subjectFor(u.id).next(u);
  }

  complete(id: number) {
    this.subjects.get(id)?.complete();
    this.subjects.delete(id);
  }
}

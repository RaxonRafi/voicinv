import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

export interface DataEnvelope<T> {
  data: T;
}

/** Global interceptor: every successful response leaves the API as `{ data }`. */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, DataEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<DataEnvelope<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}

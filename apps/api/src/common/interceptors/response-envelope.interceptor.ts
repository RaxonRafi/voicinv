import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

export interface DataEnvelope<T> {
  data: T;
}

/**
 * Global interceptor: every successful JSON response leaves the API as `{ data }`.
 * File downloads (`StreamableFile`, e.g. an encrypted backup) are sent as they are.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  DataEnvelope<T> | StreamableFile
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<DataEnvelope<T> | StreamableFile> {
    return next.handle().pipe(map((data) => (data instanceof StreamableFile ? data : { data })));
  }
}

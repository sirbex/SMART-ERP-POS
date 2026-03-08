// Request Correlation ID Middleware
// Attaches a unique x-request-id to every request for cross-service tracing

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-request-id';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers[HEADER] as string) || randomUUID();
    req.requestId = id;
    res.setHeader(HEADER, id);
    next();
}

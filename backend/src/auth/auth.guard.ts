import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { auth } from './auth';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
}

/** Verifies the Better Auth session cookie/bearer against the shared database. */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers ?? {})) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(','));
    }
    const session = await auth.api.getSession({ headers }).catch(() => null);
    if (!session?.user) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
      });
    }
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    } satisfies RequestUser;
    return true;
  }
}

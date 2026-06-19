import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CorsOriginsCacheService } from './cors-origins-cache.service';

type RouteGroup = 'public' | 'merchant_api' | 'dashboard';

function getRouteGroup(path: string, method: string): RouteGroup {
  if (path.startsWith('/health') || path.startsWith('/metrics')) return 'public';

  if (method === 'GET' && /^\/v1\/checkout\/sessions\/[^\/]+$/.test(path)) return 'public';
  if (method === 'POST' && path === '/merchants/register') return 'public';

  if (path.startsWith('/v1/checkout/')) return 'merchant_api';
  if (path.startsWith('/v1/webhooks/')) return 'merchant_api';

  if (path.startsWith('/merchants/')) return 'dashboard';
  if (path.startsWith('/auth/')) return 'dashboard';

  return 'public';
}

function originMatches(origin: string, allowed: string[]): boolean {
  return allowed.some(
    (a) => a === origin || a === '*' || (a.endsWith('/*') && origin.startsWith(a.slice(0, -1))),
  );
}

@Injectable()
export class DynamicCorsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DynamicCorsMiddleware.name);
  private readonly platformOrigin: string;

  constructor(private readonly corsCache: CorsOriginsCacheService) {
    const domain = process.env.PLATFORM_DOMAIN ?? 'http://localhost:3001';
    this.platformOrigin = new URL(domain).origin;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const origin = req.headers['origin'] as string | undefined;
    const method = req.method;
    const path = req.path;
    const group = getRouteGroup(path, method);

    let allowedOrigin: string | null = null;

    switch (group) {
      case 'public': {
        if (origin) {
          allowedOrigin = origin;
        }
        break;
      }
      case 'merchant_api': {
        if (!origin) {
          allowedOrigin = this.platformOrigin;
          break;
        }
        const allowed = await this.getAllowedMerchantOrigins();
        if (originMatches(origin, [...allowed, this.platformOrigin])) {
          allowedOrigin = origin;
        }
        break;
      }
      case 'dashboard': {
        if (!origin) {
          allowedOrigin = this.platformOrigin;
          break;
        }
        if (origin === this.platformOrigin) {
          allowedOrigin = origin;
        }
        break;
      }
    }

    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      if (method === 'OPTIONS') {
        res.setHeader('Access-Control-Max-Age', '86400');
        res.status(204).end();
        return;
      }
    } else if (origin) {
      this.logger.warn(`Blocked CORS request from origin=${origin} to path=${path}`);
      res.status(403).json({
        error: 'CORS_ORIGIN_DENIED',
        message: 'Origin not allowed',
      });
      return;
    }

    next();
  }

  private async getAllowedMerchantOrigins(): Promise<string[]> {
    try {
      return await this.corsCache.getAllMerchantOrigins();
    } catch {
      return [];
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { db } from '../db/index';
import { paymentLinks } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { Config } from '../config/config.schema';

@Injectable()
export class PaymentLinksService {
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService<Config>) {
    this.frontendUrl = this.config.get('FRONTEND_URL', { infer: true }) ?? 'http://localhost:3000';
  }

  async create(
    merchantId: string,
    dto: {
      amount: number;
      asset: string;
      assetIssuer?: string;
      description?: string;
      displayCurrency?: string;
      metadata?: Record<string, unknown>;
      expiresIn?: number;
    },
  ) {
    const expiresAt = dto.expiresIn ? new Date(Date.now() + dto.expiresIn * 1000) : null;

    const [link] = await db
      .insert(paymentLinks)
      .values({
        merchantId,
        amount: dto.amount.toString(),
        assetCode: dto.asset,
        assetIssuer: dto.assetIssuer ?? null,
        description: dto.description ?? null,
        displayCurrency: dto.displayCurrency ?? null,
        metadata: dto.metadata ?? null,
        expiresAt,
      } as any)
      .returning();

    return this.toDto(link);
  }

  async findOne(merchantId: string, linkId: string) {
    const link = await db.query.paymentLinks.findFirst({
      where: and(eq(paymentLinks.id, linkId), eq(paymentLinks.merchantId, merchantId)),
    });
    if (!link) throw new NotFoundException('Payment link not found');
    return this.toDto(link);
  }

  async findAll(merchantId: string) {
    const links = await db.query.paymentLinks.findMany({
      where: eq(paymentLinks.merchantId, merchantId),
      orderBy: [desc(paymentLinks.createdAt)],
    });
    return links.map((l) => this.toDto(l));
  }

  private toDto(link: any) {
    return {
      id: link.id,
      url: `${this.frontendUrl}/pay/${link.id}`,
      amount: link.amount,
      asset: link.assetCode,
      description: link.description,
      active: link.active,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
    };
  }
}

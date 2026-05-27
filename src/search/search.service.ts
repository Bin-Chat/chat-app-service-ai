import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingService } from '../qdrant/embedding.service';
import { QdrantService, COLLECTION_MESSAGES } from '../qdrant/qdrant.service';

export interface SearchResult {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  score: number;
}

interface MessageSearchPayload {
  messageId?: string;
  conversationId?: string;
  senderId?: string;
  content?: string;
  timestamp?: string;
  isRevoked?: boolean;
}

interface SearchHit {
  id: string | number;
  score: number;
  payload?: MessageSearchPayload;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  private readonly toxicPatterns: RegExp[] = [
    /\b(dm|dit|lon|cac|buoi|vl|vcl|vkl|clm)\b/i,
    /\b(me may|con cho|do cho)\b/i,
    /\b(danh chet|giet|dam chet)\b/i,
  ];

  constructor(
    private qdrantService: QdrantService,
    private embeddingService: EmbeddingService
  ) {}

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    return this.normalize(text)
      .split(' ')
      .filter((t) => t.length >= 2);
  }

  private lexicalOverlapScore(queryTokens: string[], content: string): number {
    if (queryTokens.length === 0) return 0;
    const contentTokens = new Set(this.tokenize(content));
    let overlap = 0;
    for (const token of queryTokens) {
      if (contentTokens.has(token)) overlap++;
    }
    return overlap / queryTokens.length;
  }

  private isPotentiallyToxic(content: string): boolean {
    const normalized = this.normalize(content);
    return this.toxicPatterns.some((p) => p.test(normalized));
  }

  async searchMessages(
    query: string,
    conversationId?: string,
    limit = 10,
    minScore?: number
  ): Promise<SearchResult[]> {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Dynamic threshold: short queries need higher confidence to avoid noisy matches.
    const wordCount = queryTokens.length;
    const effectiveMinScore =
      minScore !== undefined
        ? minScore
        : wordCount <= 2
          ? 0.55
          : wordCount <= 4
            ? 0.48
            : 0.42;

    const queryVector = await this.embeddingService.embedText(query);

    const filter = conversationId
      ? { must: [{ key: 'conversationId', match: { value: conversationId } }] }
      : undefined;

    let results: SearchHit[];
    try {
      const candidateLimit = Math.min(limit * 8, 120);
      results = (await this.qdrantService.search(
        COLLECTION_MESSAGES,
        queryVector,
        candidateLimit,
        filter
      )) as SearchHit[];
    } catch (err: unknown) {
      // Collection may not exist yet (no messages indexed)
      const maybeError = err as { status?: number; message?: string };
      if (maybeError?.status === 404 || maybeError?.message?.includes('Not found')) {
        this.logger.warn(`Collection ${COLLECTION_MESSAGES} not found — no messages indexed yet`);
        return [];
      }
      throw err;
    }

    const ranked = results
      .map((r) => {
        const payload = r.payload ?? {};
        const content = String(payload.content ?? '').trim();
        if (!content) return null;
        if (payload.isRevoked) return null;
        if (this.isPotentiallyToxic(content)) return null;

        const semanticScore = Number(r.score ?? 0);
        const lexicalScore = this.lexicalOverlapScore(queryTokens, content);

        // Keep strong semantic matches or meaningful lexical overlap.
        const isStrongSemantic = semanticScore >= effectiveMinScore;
        const hasLexicalMatch = wordCount <= 2 ? lexicalScore >= 0.5 : lexicalScore >= 0.34;
        if (!isStrongSemantic && !hasLexicalMatch) return null;

        const finalScore = semanticScore * 0.75 + lexicalScore * 0.25;
        return { r, finalScore };
      })
      .filter((x): x is { r: SearchHit; finalScore: number } => !!x)
      .sort((a, b) => b.finalScore - a.finalScore);

    return ranked
      .slice(0, limit)
      .map((r) => ({
        messageId: r.r.payload?.messageId ?? String(r.r.id),
        conversationId: r.r.payload?.conversationId ?? '',
        senderId: r.r.payload?.senderId ?? '',
        content: r.r.payload?.content ?? '',
        timestamp: r.r.payload?.timestamp ?? '',
        score: r.finalScore,
      }));
  }
}

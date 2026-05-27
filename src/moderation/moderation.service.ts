import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  severity: 'low' | 'medium' | 'high';
  reason?: string;
}

// ── Normalize: strip Vietnamese diacritics, lowercase, collapse whitespace ───
// Keep only alphanumeric + spaces so leet/unicode tricks don't bypass patterns

// ── HIGH severity: threats, incitement to violence ───────────────────────────
const VI_HIGH_PATTERNS: RegExp[] = [
  // tao sẽ giết/đâm/đánh/bắn/phá mày/mi/ông/bà/anh/chị/chúng mày
  /\b(tao\s*(?:se\s*)?(?:giet|dam|danh|ban|pha|chat|troi|thieu|dot)\s*(?:may|mi|ban|ong|ba|anh|chi|chung\s*may|bon\s*may|tui\s*bay))\b/i,
  // giết chết/hết/sạch chúng mày/bọn mày
  /\b(giet\s*(?:chet|het|sach)\s*(?:chung\s*may|tui\s*bay|bon\s*may|may|mi))\b/i,
  // đánh chết / đâm chết / phá chết / giết chết / chặt đầu / cắt cổ
  /\b(danh\s*chet|dam\s*chet|pha\s*chet|giet\s*chet|chat\s*dau|cat\s*co)\b/i,
  // muốn giết / định giết / sẽ giết
  /\b(muon|dinh|se)\s*(giet|dam|danh|ban|pha|chat|treo\s*co)\b/i,
  // bắn vỡ đầu / đập vỡ đầu
  /\b(ban|dap|vo)\s*vo\s*dau\b/i,
  // khủng bố / đánh bom / nổ bom
  /\b(khung\s*bo|danh\s*bom|no\s*bom|nem\s*bom)\b/i,
];

// ── MEDIUM severity: profanity, sexual language, strong insults ───────────────
const VI_MEDIUM_PATTERNS: RegExp[] = [
  // Common profanity abbreviations — keep only unambiguous multi-char ones
  // Removed: cl, vl — too short/ambiguous in Vietnamese (e.g. "chắc là", "vui lòng")
  /\b(dm|dit|clm|vcl|vkl|dkm|dcm|dmm|dcc)\b/i,
  // đ** variations with l33t spacing/dashes/dots — require AT LEAST ONE separator
  // (prevents matching plain normalized Vietnamese words like các→cac, lẫn→lon, buổi→buoi)
  /d[\s.\-_*#@]+[iíì][\s.\-_*#@]+t/i,
  /l[\s.\-_*#@]+[oô0][\s.\-_*#@]+[nñ]/i,
  /c[\s.\-_*#@]+[aă][\s.\-_*#@]+c/i,
  /b[\s.\-_*#@]+u[\s.\-_*#@]+[oô0][\s.\-_*#@]+[iíì]/i,
  // thằng + insult noun (standalone "thang" removed — matches "thắng"/victory after normalization)
  /\b(thang\s*(?:cho|dien|ngu|kho|noc|dac|khung|khon|rong|toi|beo|hoi|chui|chet|dit))\b/i,
  // con + insult noun
  /\b(con\s*(?:cho|di|bip|dien|lon|khung|ngu|kho|rong|toi|hoi|chet))\b/i,
  // đồ + insult noun
  /\b(do\s*(?:cho|ngu|kho|lon|dit|bip|dien|hoi|chet|tham|man|chui))\b/i,
  // mày chết / chúc mày chết / đi chết đi
  /\b(may\s*chet|chuc\s*may\s*chet|di\s*chet\s*(?:di|thoi|het|duoc\s*roi))\b/i,
  // cút đi / xéo đi / biến đi
  /\b(cut\s*(?:di|ra|ngay|khoi)|xeo\s*(?:di|ra|ngay)|bien\s*(?:di|ra|ngay|khoi))\b/i,
  // đụ + target (standalone "du" removed — matches "du lịch"/travel, "du học" after normalization)
  /\b(du\s*(?:ma|cha|me|vao|cho|het|nhau))\b/i,
  /\b(dit\s*(?:me|cha|bo|bam|vao))\b/i,
  // fuck/shit/bitch as typed by Vietnamese speakers mixed with Vietnamese
  /\b(fuck|shit|bitch|asshole|bastard)\b/i,
  // vãi (intensity marker in profanity: vãi lờn / vãi cả ...)
  /\b(vai\s*(?:lon|ca|nhe|dai|chu|ca\s*lon))\b/i,
  // ngu như bò / ngu như chó
  /\b(ngu\s*nhu\s*(?:bo|cho|lon|heo|trau))\b/i,
  // sexual harassment phrases
  /\b(muon\s*(?:dit|du|lam\s*tinh|ngu\s*voi)\s*(?:may|mi|em|chi|co))\b/i,
  /\b(hiep\s*(?:dam|may|mi)|cuong\s*dam)\b/i,
];

// ── OpenAI score thresholds ───────────────────────────────────────────────────
const SCORE_THRESHOLD = 0.62;
const HIGH_SCORE_THRESHOLD = 0.82;
const MEDIUM_SCORE_THRESHOLD = 0.75;

const HIGH_SEVERITY_CATEGORIES = [
  'violence',
  'sexual',
  'hate',
  'self-harm',
  'violence/graphic',
  'sexual/minors',
  'hate/threatening',
  'self-harm/intent',
  'self-harm/instructions',
];

const OPENAI_TIMEOUT_MS = 5_000;

const SEVERITY_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private openai: OpenAI;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Strip Vietnamese tone marks → lowercase → collapse punctuation → single spaces.
   * Preserves word boundaries so regex \b anchors work correctly.
   */
  private normalize(text: string): string {
    return (
      text
        .toLowerCase()
        .normalize('NFD')
        // Remove combining diacritics (tone marks + base modifications)
        .replace(/[\u0300-\u036f]/g, '')
        // Vietnamese-specific decomposed chars that NFD doesn't fully strip:
        // đ → d (NFD gives \u0111, not decomposed)
        .replace(/\u0111/g, 'd')
        // Replace punctuation/special chars with spaces (preserves \b word boundary)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Optional: check the raw (non-normalized) text for unicode-encoded profanity
   * that might slip through normalization (e.g. zero-width joiners, lookalike chars).
   */
  private checkRawUnicodeTricks(text: string): boolean {
    // Zero-width characters inserted to break patterns
    if (/[\u200b-\u200f\u2060\ufeff]/.test(text)) return true;
    // Full-width Latin (Ａ-Ｚ range)
    if (/[\uff01-\uff5e]/.test(text)) return true;
    return false;
  }

  private checkVietnameseToxic(text: string): {
    flagged: boolean;
    severity: 'medium' | 'high';
    reason?: string;
  } {
    // Suspicious unicode tricks → escalate to OpenAI but pre-flag
    if (this.checkRawUnicodeTricks(text)) {
      return { flagged: true, severity: 'medium', reason: 'unicode_obfuscation' };
    }

    const normalized = this.normalize(text);

    for (const pattern of VI_HIGH_PATTERNS) {
      if (pattern.test(normalized)) {
        return { flagged: true, severity: 'high', reason: 'vietnamese_threat' };
      }
    }
    for (const pattern of VI_MEDIUM_PATTERNS) {
      if (pattern.test(normalized)) {
        return { flagged: true, severity: 'medium', reason: 'vietnamese_profanity' };
      }
    }

    return { flagged: false, severity: 'medium' };
  }

  private computeAiSeverity(categoryScores: Record<string, number>): 'low' | 'medium' | 'high' {
    const scores = Object.values(categoryScores);
    if (scores.length === 0) return 'low';
    const maxScore = Math.max(...scores);
    const hasHighCategory = HIGH_SEVERITY_CATEGORIES.some(
      (cat) => (categoryScores[cat] ?? 0) >= HIGH_SCORE_THRESHOLD
    );
    if (hasHighCategory || maxScore >= 0.9) return 'high';
    if (maxScore >= MEDIUM_SCORE_THRESHOLD) return 'medium';
    return 'low';
  }

  async moderate(text: string): Promise<ModerationResult> {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length < 2) {
      return { flagged: false, categories: {}, categoryScores: {}, severity: 'low' };
    }

    // Layer 1: Vietnamese rule-based check (fast, no API cost)
    const viCheck = this.checkVietnameseToxic(trimmed);

    let categoryScores: Record<string, number> = {};
    const filteredCategories: Record<string, boolean> = {};
    let openAiFlagged = false;

    try {
      // Layer 2: OpenAI moderation with hard timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
      const response = await this.openai.moderations
        .create({ model: 'omni-moderation-latest', input: trimmed }, { signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));

      const result = response.results[0];
      categoryScores = result.category_scores as unknown as Record<string, number>;

      for (const [cat, score] of Object.entries(categoryScores)) {
        filteredCategories[cat] = score >= SCORE_THRESHOLD;
      }

      const highHits = Object.values(categoryScores).filter(
        (s) => s >= HIGH_SCORE_THRESHOLD
      ).length;
      const mediumHits = Object.values(categoryScores).filter(
        (s) => s >= MEDIUM_SCORE_THRESHOLD
      ).length;
      openAiFlagged = highHits >= 1 || mediumHits >= 2;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`OpenAI moderation unavailable: ${msg}`);
      // Fallback: rely solely on Vietnamese rule-based result
    }

    const flagged = openAiFlagged || viCheck.flagged;

    // Final severity = worst of AI and Vietnamese checks
    const aiSeverity = this.computeAiSeverity(categoryScores);
    const viSeverity: 'low' | 'medium' | 'high' = viCheck.flagged ? viCheck.severity : 'low';
    const severity: 'low' | 'medium' | 'high' =
      SEVERITY_RANK[aiSeverity] >= SEVERITY_RANK[viSeverity] ? aiSeverity : viSeverity;

    if (flagged) {
      this.logger.debug(
        `Flagged — openAI:${openAiFlagged} vi:${viCheck.flagged} severity:${severity} text="${trimmed.slice(0, 60)}"`
      );
    }

    return {
      flagged,
      categories: filteredCategories,
      categoryScores,
      severity,
      reason: viCheck.reason,
    };
  }
}

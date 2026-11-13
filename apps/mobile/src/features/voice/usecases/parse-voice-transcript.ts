import { type Orm } from '@/core/db';
import { parseVoice, type ParseResult } from '@/parser';
import { type LanguageCode } from '@/shared';

import { loadParserContext } from '../repository';

export async function parseVoiceTranscript(
  orm: Orm,
  transcript: string,
  language: LanguageCode,
): Promise<ParseResult> {
  const context = await loadParserContext(orm, language);
  return parseVoice(transcript, context, language);
}


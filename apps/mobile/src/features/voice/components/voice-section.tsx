import { useTranslation } from '@/core/i18n';
import { Box, Button, Card, Divider, Icon, MicButton, Row, Text } from '@/core/ui';

import { useVoiceBilling, type UseVoiceBillingOptions } from '../hooks/use-voice-billing';

export interface VoiceSectionProps extends UseVoiceBillingOptions {
  testID?: string;
}

export function VoiceSection({ speechEngine, ttsEngine, testID }: VoiceSectionProps) {
  const { t } = useTranslation();
  const { state, onStart, onStop, dismissAnswer, repeatAnswer } = useVoiceBilling({
    speechEngine,
    ttsEngine,
  });

  return (
    <Card testID={testID ?? 'voice-section'} padding="lg" gap="md">
      <Row justify="between" align="center">
        <Box flex gap="xs">
          <Text variant="title">{t('voice.title')}</Text>
          <Text variant="caption" tone="secondary">
            {t('voice.micHint')}
          </Text>
        </Box>
        <Icon name="mic" tone="primary" />
      </Row>

      <Box align="center" gap="md">
        <MicButton
          listening={state.status === 'listening'}
          onStart={() => void onStart()}
          onStop={() => void onStop()}
          disabled={state.status === 'processing'}
          testID="voice-mic-button"
        />

        {state.status === 'listening' && state.transcript ? (
          <Text variant="body" tone="secondary" align="center">
            "{state.transcript}"
          </Text>
        ) : null}

        {state.status === 'processing' ? (
          <Text variant="body" tone="secondary" align="center">
            {t('voice.micProcessing')}
          </Text>
        ) : null}
      </Box>

      {state.status === 'answered' && state.lastSpokenAnswer ? (
        <Card elevation="raised" padding="md" gap="sm" testID="voice-query-answer">
          <Row gap="xs" align="center">
            <Icon name="checkCircle" tone="success" size="sm" />
            <Text variant="bodyStrong" flex>
              {state.lastSpokenAnswer}
            </Text>
          </Row>
          <Divider />
          <Row justify="end" gap="sm">
            <Button
              variant="secondary"
              label={t('voice.repeatAnswer')}
              icon="speaker"
              onPress={() => void repeatAnswer()}
              testID="voice-repeat-answer"
            />
            <Button
              variant="ghost"
              label={t('voice.dismiss')}
              onPress={dismissAnswer}
              testID="voice-dismiss-answer"
            />
          </Row>
        </Card>
      ) : null}
    </Card>
  );
}

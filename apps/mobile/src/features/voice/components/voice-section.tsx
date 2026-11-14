import { useTranslation } from '@/core/i18n';
import { useUi } from '@/core/ui/use-ui';
import { Banner, Box, Button, Card, Divider, Icon, MicButton, Row, Text } from '@/core/ui';
import { View } from 'react-native';

import { useVoiceBilling, type UseVoiceBillingOptions } from '../hooks/use-voice-billing';

export interface VoiceSectionProps extends UseVoiceBillingOptions {
  testID?: string;
}

export function VoiceSection({ speechEngine, ttsEngine, testID }: VoiceSectionProps) {
  const { t } = useTranslation();
  const { theme } = useUi();
  const { state, onStart, onStop, dismissAnswer, repeatAnswer, languageMissing, installLanguage } =
    useVoiceBilling({ speechEngine, ttsEngine });

  return (
    <Card testID={testID ?? 'voice-section'} padding="lg" gap="md">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading">{t('home.holdToTalk')}</Text>
          <Text variant="label" tone="secondary">
            {t('home.holdToTalkHint')}
          </Text>
        </View>
        <MicButton
          listening={state.status === 'listening'}
          onStart={() => void onStart()}
          onStop={() => void onStop()}
          disabled={state.status === 'processing'}
          size="md"
          showLabel={false}
          testID="voice-mic-button"
        />
      </View>

      {languageMissing ? (
        <Banner
          tone="warning"
          title={t('voice.languagePackTitle')}
          message={t('voice.languagePackMessage')}
          action={{ label: t('voice.languagePackDownload'), onPress: () => void installLanguage() }}
        />
      ) : null}

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

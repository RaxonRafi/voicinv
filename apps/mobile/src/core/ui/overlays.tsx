import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/core/i18n';
import { boxShadow } from '@/core/theme';

import { Button, IconButton } from './button';
import { Text } from './text';
import { useUi } from './use-ui';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testID?: string;
}

/**
 * Sheet that slides up from the bottom, built on the native `Modal` (system back button and
 * accessibility focus handling come for free). Closes on the backdrop, the close button or the
 * system back gesture. The content scrolls when it is taller than the screen.
 */
export function BottomSheet({ visible, onClose, title, children, testID }: BottomSheetProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.fill}>
        <Pressable
          style={[styles.fill, { backgroundColor: theme.colors.bg.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '85%',
            paddingBottom: insets.bottom + theme.spacing.lg,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.bg.raised,
            boxShadow: boxShadow(theme, 'lg'),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              paddingLeft: theme.spacing.lg,
              paddingRight: theme.spacing.xs,
              paddingTop: theme.spacing.sm,
            }}
          >
            <Text variant="heading" accessibilityRole="header" flex>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel={t('common.close')} onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  /** Styles the confirm button as destructive (cancel invoice, restore backup, …). */
  destructive?: boolean;
  /** Disables both buttons and shows a spinner on confirm while the action runs. */
  busy?: boolean;
  /** Extra content between the message and the buttons, e.g. a field for a reason. */
  children?: ReactNode;
  testID?: string;
}

/**
 * Modal question that needs an explicit answer before continuing. The system back button
 * counts as cancel.
 */
export function Dialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  destructive = false,
  children,
  busy = false,
  testID,
}: DialogProps) {
  const { theme } = useUi();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      testID={testID}
    >
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: theme.colors.bg.overlay, padding: theme.spacing.xl },
        ]}
      >
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={{
            alignSelf: 'stretch',
            gap: theme.spacing.lg,
            padding: theme.spacing.xl,
            borderRadius: theme.radius.lg,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.bg.raised,
            boxShadow: boxShadow(theme, 'lg'),
          }}
        >
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>
          <Text tone="secondary">{message}</Text>
          {children}
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              loading={busy}
              testID={testID ? `${testID}-confirm` : undefined}
            />
            <Button
              label={cancelLabel ?? t('common.cancel')}
              onPress={onCancel}
              variant="secondary"
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});

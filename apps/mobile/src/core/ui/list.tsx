import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { type ReactElement } from 'react';
import { View } from 'react-native';

import { Divider } from './layout';
import { useUi } from './use-ui';

function Gap() {
  const { theme } = useUi();
  return <View style={{ height: theme.spacing.md }} />;
}

function Seam() {
  const { theme } = useUi();
  return <View style={{ height: theme.spacing.xs / 2 }} />;
}

const SEPARATORS = { divider: Divider, gap: Gap, seam: Seam, none: undefined } as const;

export interface ListProps<T> {
  data: readonly T[];
  /**
   * Renders one row. Keep it cheap and pass primitives to a memoized row component, so rows
   * that did not change are not re-rendered while scrolling.
   */
  renderItem: (item: T, index: number) => ReactElement;
  keyExtractor: (item: T) => string;
  header?: ReactElement;
  footer?: ReactElement;
  /** Shown when `data` is empty, usually an EmptyState. */
  empty?: ReactElement;
  /**
   * What goes between rows: a `divider` line (default), a `gap` between rows that are cards of
   * their own, a thin `seam` between rows that join into one card, or `none`.
   */
  separator?: keyof typeof SEPARATORS;
  /** Keep the rows away from the screen edges (rows with their own card surface). */
  padded?: boolean;
  testID?: string;
}

/**
 * Virtualized list: only visible rows are mounted, so long customer and invoice lists stay
 * smooth on low-end phones. Every scrollable collection uses this, never a mapped ScrollView.
 */
export function List<T>({
  data,
  renderItem,
  keyExtractor,
  header,
  footer,
  empty,
  separator = 'divider',
  padded = false,
  testID,
}: ListProps<T>) {
  const { theme } = useUi();
  return (
    <FlashList
      data={data}
      renderItem={({ item, index }) => renderItem(item, index)}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={SEPARATORS[separator]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: padded ? theme.spacing.lg : 0,
        // Room to scroll the last row clear of a floating action button.
        paddingBottom: theme.spacing['4xl'] + theme.spacing['2xl'],
      }}
      testID={testID}
    />
  );
}

export interface LogoProps {
  /** Image as a data URI or file URI. */
  uri: string;
  accessibilityLabel: string;
}

/** The shop's logo at a fixed token size, loaded through expo-image for memory-safe caching. */
export function Logo({ uri, accessibilityLabel }: LogoProps) {
  const { theme } = useUi();
  const size = theme.spacing['4xl'];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.lg,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: theme.colors.bg.sunken,
      }}
    >
      <ExpoImage
        source={{ uri }}
        contentFit="contain"
        accessibilityLabel={accessibilityLabel}
        style={{ width: size, height: size }}
      />
    </View>
  );
}

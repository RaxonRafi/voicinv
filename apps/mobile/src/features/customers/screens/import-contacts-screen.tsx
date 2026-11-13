import { router } from 'expo-router';
import { memo, useEffect, useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { useShopContext } from '@/core/services';
import {
  Avatar,
  Banner,
  Box,
  Button,
  EmptyState,
  Icon,
  List,
  ListItem,
  Screen,
  ScreenHeader,
  showToast,
  Spinner,
} from '@/core/ui';

import { type ContactsResult, readPhoneContacts } from '../contacts-source';
import { type ContactToImport } from '../types';
import { importCustomers } from '../usecases';

interface ContactRowProps {
  name: string;
  phone: string | undefined;
  selected: boolean;
  selectedLabel: string;
  onToggle: (name: string) => void;
}

const ContactRow = memo(function ContactRow({
  name,
  phone,
  selected,
  selectedLabel,
  onToggle,
}: ContactRowProps) {
  return (
    <ListItem
      title={name}
      subtitle={phone}
      accessibilityLabel={selected ? `${name}, ${selectedLabel}` : name}
      leading={<Avatar name={name} />}
      trailing={selected ? <Icon name="checkCircle" tone="success" /> : undefined}
      onPress={() => onToggle(name)}
    />
  );
});

type LoadState = { status: 'loading' } | { status: 'failed' } | ContactsResult;

interface ImportContactsScreenProps {
  /** Where contacts come from. Tests pass a fake; the app reads the phone's address book. */
  readContacts?: () => Promise<ContactsResult>;
}

/** Lets the shopkeeper pick people from the phone's contacts and adds them as customers. */
export function ImportContactsScreen({
  readContacts = readPhoneContacts,
}: ImportContactsScreenProps) {
  const { t } = useTranslation();
  const app = useShopContext();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    readContacts().then(
      (result) => {
        if (active) setState(result);
      },
      () => {
        if (active) setState({ status: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [readContacts]);

  const toggle = (name: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  const contacts: ContactToImport[] = state.status === 'granted' ? state.contacts : [];

  const addSelected = async () => {
    if (!app) return;
    setSaving(true);
    try {
      const result = await importCustomers(
        app.ctx,
        contacts.filter((contact) => selected.has(contact.name)),
      );
      showToast(t('customers.import.done', { added: result.added, skipped: result.skipped }));
      router.back();
    } catch {
      showToast(t('common.somethingWrong'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!app || state.status === 'loading') {
    return (
      <Screen>
        <ScreenHeader title={t('customers.import.title')} />
        <Spinner label={t('customers.import.loading')} />
      </Screen>
    );
  }
  if (state.status === 'denied' || state.status === 'failed') {
    return (
      <Screen>
        <ScreenHeader title={t('customers.import.title')} />
        <EmptyState
          icon="customers"
          title={
            state.status === 'denied' ? t('customers.import.denied') : t('common.somethingWrong')
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      padded={false}
      testID="import-contacts-screen"
      footer={
        <Button
          label={t('customers.import.addSelected', { count: selected.size })}
          onPress={() => void addSelected()}
          disabled={selected.size === 0}
          loading={saving}
          testID="import-contacts-add"
        />
      }
    >
      <ScreenHeader title={t('customers.import.title')} />
      <List
        data={contacts}
        keyExtractor={(contact) => contact.name}
        header={
          <Box padding="lg">
            <Banner
              tone="info"
              icon="shield"
              title={t('customers.import.choose')}
              message={t('customers.import.privacy')}
            />
          </Box>
        }
        empty={<EmptyState icon="customers" title={t('customers.import.none')} />}
        renderItem={(contact) => (
          <ContactRow
            name={contact.name}
            phone={contact.phone}
            selected={selected.has(contact.name)}
            selectedLabel={t('customers.import.selected')}
            onToggle={toggle}
          />
        )}
      />
    </Screen>
  );
}

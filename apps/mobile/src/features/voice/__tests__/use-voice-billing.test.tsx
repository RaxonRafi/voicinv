import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { customers, ledgerEntries, products } from '@/core/db';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';

import { VoiceSection } from '../components/voice-section';
import { useVoiceDraftStore } from '../hooks/use-voice-draft';
import { FakeSpeechEngine } from '../speech-engine/fake-engine';
import { FakeTTSEngine } from '../tts/fake-tts';

describe('VoiceSection and useVoiceBilling', () => {
  let app: TestShopApp;
  let fakeSpeech: FakeSpeechEngine;
  let fakeTts: FakeTTSEngine;
  let customerId: string;
  let productId: string;

  beforeEach(async () => {
    app = await createTestShopApp();
    fakeSpeech = new FakeSpeechEngine();
    fakeTts = new FakeTTSEngine();
    useVoiceDraftStore.getState().clearPendingDraft();

    customerId = app.ctx.newId();
    productId = app.ctx.newId();

    await app.ctx.db.write(async (tx) => {
      await tx.orm.insert(customers).values({
        id: customerId,
        shopId: app.shopId,
        name: 'Karim',
        phone: '',
        notes: '',
        creditLimit: null,
        isArchived: false,
        createdAt: app.ctx.now(),
        updatedAt: app.ctx.now(),
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(products).values({
        id: productId,
        shopId: app.shopId,
        name: 'Rice',
        unit: 'bag',
        defaultPrice: 250000,
        stockQty: null,
        isArchived: false,
        createdAt: app.ctx.now(),
        updatedAt: app.ctx.now(),
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('handles voice sale command, populates pending draft and navigates to new invoice screen', async () => {
    fakeSpeech.setMockResult('two bags of rice to karim paid half', 0.95);

    await renderWithApp(
      <VoiceSection speechEngine={fakeSpeech} ttsEngine={fakeTts} />,
      app.services,
    );

    const micButton = screen.getByTestId('voice-mic-button');

    // Press down (start listening)
    await fireEvent(micButton, 'onPressIn');
    // Release (stop and process)
    await fireEvent(micButton, 'onPressOut');

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/invoices/new?fromVoice=1');
    });

    const pendingDraft = useVoiceDraftStore.getState().pendingDraft;
    expect(pendingDraft).not.toBeNull();
    expect(pendingDraft?.customerName).toBe('Karim');
    expect(pendingDraft?.customerId).toBe(customerId);
    expect(pendingDraft?.items).toHaveLength(1);
    expect(pendingDraft?.items[0]?.name).toBe('Rice');
    expect(pendingDraft?.items[0]?.qtyMilli).toBe(2000);
    expect(pendingDraft?.items[0]?.unitPrice).toBe(250000);
  });

  it.each([
    ['en', 'hello, 500 taka', 'Item'],
    ['bn', '৫০০ টাকা', 'পণ্য'],
  ] as const)(
    'turns a bare amount (%s: "%s") into a filled line, not an empty invoice',
    async (language, spoken, itemName) => {
      fakeSpeech.setMockResult(spoken, 0.95);
      await renderWithApp(
        <VoiceSection speechEngine={fakeSpeech} ttsEngine={fakeTts} />,
        app.services,
        language,
      );

      const micButton = screen.getByTestId('voice-mic-button');
      await fireEvent(micButton, 'onPressIn');
      await fireEvent(micButton, 'onPressOut');

      await waitFor(() => {
        expect(router.push).toHaveBeenCalledWith('/invoices/new?fromVoice=1');
      });
      const draft = useVoiceDraftStore.getState().pendingDraft;
      expect(draft?.items).toEqual([
        expect.objectContaining({ name: itemName, qtyMilli: 1000, unitPrice: 50_000 }),
      ]);
    },
  );

  it('handles customer balance query and speaks the result aloud', async () => {
    await app.ctx.db.write(async (tx) => {
      await tx.orm.insert(ledgerEntries).values({
        id: app.ctx.newId(),
        shopId: app.shopId,
        customerId,
        type: 'INVOICE_DUE',
        amount: 50000,
        refId: 'inv-1',
        createdAt: app.ctx.now(),
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });
    });

    fakeSpeech.setMockResult('karim balance', 0.95);

    await renderWithApp(
      <VoiceSection speechEngine={fakeSpeech} ttsEngine={fakeTts} />,
      app.services,
    );

    const micButton = screen.getByTestId('voice-mic-button');

    await fireEvent(micButton, 'onPressIn');
    await fireEvent(micButton, 'onPressOut');

    await waitFor(() => {
      expect(screen.getByTestId('voice-query-answer')).toBeOnTheScreen();
    });

    expect(screen.getByText('Karim owes ৳500.')).toBeOnTheScreen();
    expect(fakeTts.lastSpokenText).toBe('Karim owes ৳500.');

    // Test repeating answer
    const repeatButton = screen.getByTestId('voice-repeat-answer');
    await fireEvent.press(repeatButton);
    expect(fakeTts.spokenHistory.length).toBe(2);

    // Test dismissing answer
    const dismissButton = screen.getByTestId('voice-dismiss-answer');
    await fireEvent.press(dismissButton);
    expect(screen.queryByTestId('voice-query-answer')).toBeNull();
  });

  it('handles empty transcript without crashing', async () => {
    fakeSpeech.setMockResult('', 0);

    await renderWithApp(
      <VoiceSection speechEngine={fakeSpeech} ttsEngine={fakeTts} />,
      app.services,
    );

    const micButton = screen.getByTestId('voice-mic-button');

    await fireEvent(micButton, 'onPressIn');
    await fireEvent(micButton, 'onPressOut');

    await waitFor(() => {
      expect(screen.queryByTestId('voice-query-answer')).toBeNull();
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});

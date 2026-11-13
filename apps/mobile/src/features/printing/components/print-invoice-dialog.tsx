import { useState } from 'react';

import { useTranslation } from '@/core/i18n';
import { type ShopContext } from '@/core/services';
import {
  BottomSheet,
  Box,
  Button,
  Card,
  Divider,
  Icon,
  ListItem,
  Row,
  Select,
  showToast,
  Text,
} from '@/core/ui';
import { type InvoiceDetails } from '@/features/invoices';

import { usePrinterStore } from '../hooks/use-printer';
import { type BluetoothDevice, type PaperSize } from '../types';
import { formatInvoiceEscPos } from '../usecases/format-receipt';

export interface PrintInvoiceDialogProps {
  app: ShopContext;
  details: InvoiceDetails;
  visible: boolean;
  onClose: () => void;
}

export function PrintInvoiceDialog({ app, details, visible, onClose }: PrintInvoiceDialogProps) {
  const { t } = useTranslation();
  const {
    status,
    connectedDevice,
    devices,
    scanning,
    paperSize,
    scan,
    connect,
    setPaperSize,
    printData,
  } = usePrinterStore();

  const [printing, setPrinting] = useState(false);
  const isConnected = status === 'connected' && connectedDevice !== null;

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const escposData = formatInvoiceEscPos({
        shop: app.shop,
        invoice: details.invoice,
        items: details.items,
        customerName: details.customerName,
        paperSize,
        formatters: app.format,
      });

      const success = await printData(escposData);
      if (success) {
        showToast(t('printing.printSuccess'), 'success');
        onClose();
      } else {
        showToast(t('printing.printFailed'), 'danger');
      }
    } catch {
      showToast(t('printing.printFailed'), 'danger');
    } finally {
      setPrinting(false);
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    const success = await connect(device);
    if (success) {
      showToast(t('printing.connectSuccess'), 'success');
    } else {
      showToast(t('printing.connectFailed'), 'danger');
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={t('printing.title')}
      onClose={onClose}
      testID="print-invoice-dialog"
    >
      <Box gap="md">
        <Row justify="between" align="center">
          <Text variant="bodyStrong">{t('printing.printer')}:</Text>
          <Text tone={isConnected ? 'primary' : 'secondary'}>
            {connectedDevice ? connectedDevice.name : t('printing.noPrinter')}
          </Text>
        </Row>

        <Select<PaperSize>
          label={t('printing.paperSize')}
          value={paperSize}
          options={[
            { value: '58mm', label: t('printing.paper58') },
            { value: '80mm', label: t('printing.paper80') },
          ]}
          onChange={setPaperSize}
          testID="print-paper-select"
        />

        {!isConnected ? (
          <Box gap="sm">
            <Button
              variant="secondary"
              label={scanning ? t('printing.scanning') : t('printing.scanForPrinters')}
              icon="bluetooth"
              onPress={() => void scan()}
              loading={scanning}
              testID="scan-printers-button"
            />

            {devices.length > 0 ? (
              <Card padding="xs" gap="xs">
                {devices.map((device) => (
                  <ListItem
                    key={device.id}
                    title={device.name}
                    subtitle={device.address}
                    leading={<Icon name="printer" tone="secondary" />}
                    trailing={
                      <Button
                        variant="ghost"
                        label={t('printing.connectPrinter')}
                        onPress={() => void handleConnect(device)}
                        testID={`connect-device-${device.id}`}
                      />
                    }
                  />
                ))}
              </Card>
            ) : null}
          </Box>
        ) : null}

        <Divider />

        <Row gap="sm">
          <Box flex>
            <Button
              variant="secondary"
              label={t('common.cancel')}
              onPress={onClose}
              testID="print-dialog-cancel"
            />
          </Box>
          <Box flex>
            <Button
              label={t('printing.printReceipt')}
              icon="printer"
              onPress={() => void handlePrint()}
              disabled={!isConnected || printing}
              loading={printing}
              testID="print-dialog-confirm"
            />
          </Box>
        </Row>
      </Box>
    </BottomSheet>
  );
}

import { useState } from 'react';

import { useTranslation } from '@/core/i18n';
import {
  Box,
  Button,
  Card,
  Divider,
  Icon,
  ListItem,
  Row,
  SectionHeader,
  Select,
  showToast,
  Text,
} from '@/core/ui';

import { EscPosBuilder } from '../escpos/encoder';
import { usePrinterStore } from '../hooks/use-printer';
import { type BluetoothDevice, type PaperSize } from '../types';

export function PrinterSettingsSection() {
  const { t } = useTranslation();
  const {
    status,
    connectedDevice,
    devices,
    scanning,
    paperSize,
    scan,
    connect,
    disconnect,
    setPaperSize,
    printData,
  } = usePrinterStore();

  const [testing, setTesting] = useState(false);
  const isConnected = status === 'connected' && connectedDevice !== null;

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const builder = new EscPosBuilder();
      builder.align('center');
      builder.bold(true);
      builder.line('VoiceLedger');
      builder.bold(false);
      builder.line(t('printing.testReceipt'));
      builder.divider(paperSize);
      builder.cut();

      const success = await printData(builder.build());
      if (success) {
        showToast(t('printing.printSuccess'), 'success');
      } else {
        showToast(t('printing.printFailed'), 'danger');
      }
    } catch {
      showToast(t('printing.printFailed'), 'danger');
    } finally {
      setTesting(false);
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
    <Box gap="md" testID="printer-settings-section">
      <SectionHeader title={t('printing.title')} />

      <Card padding="md" gap="md">
        <ListItem
          title={t('printing.printer')}
          subtitle={
            connectedDevice
              ? `${connectedDevice.name} (${t('printing.statusConnected')})`
              : t('printing.noPrinter')
          }
          leading={<Icon name="printer" tone={isConnected ? 'primary' : 'secondary'} />}
          trailing={
            isConnected ? (
              <Button
                variant="ghost"
                label={t('printing.disconnect')}
                onPress={() => void disconnect()}
                testID="printer-disconnect"
              />
            ) : undefined
          }
        />

        <Divider />

        <Select<PaperSize>
          label={t('printing.paperSize')}
          value={paperSize}
          options={[
            { value: '58mm', label: t('printing.paper58') },
            { value: '80mm', label: t('printing.paper80') },
          ]}
          onChange={setPaperSize}
          testID="settings-paper-select"
        />

        <Row gap="sm">
          <Box flex>
            <Button
              variant="secondary"
              label={scanning ? t('printing.scanning') : t('printing.scanForPrinters')}
              icon="bluetooth"
              onPress={() => void scan()}
              loading={scanning}
              testID="settings-scan-printers"
            />
          </Box>
          {isConnected ? (
            <Box flex>
              <Button
                variant="secondary"
                label={t('printing.testPrint')}
                icon="printer"
                onPress={() => void handleTestPrint()}
                loading={testing}
                testID="settings-test-print"
              />
            </Box>
          ) : null}
        </Row>

        {devices.length > 0 && !isConnected ? (
          <Box gap="xs">
            <Text variant="label" tone="secondary">
              {t('printing.deviceList')}
            </Text>
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
                    testID={`settings-connect-${device.id}`}
                  />
                }
              />
            ))}
          </Box>
        ) : null}
      </Card>
    </Box>
  );
}

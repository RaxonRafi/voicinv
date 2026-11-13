import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactElement } from 'react';

import { initI18n } from '@/core/i18n';

import {
  AmountField,
  Badge,
  Banner,
  Button,
  ConfidenceHighlight,
  EmptyState,
  IconButton,
  initialsOf,
  MicButton,
  QuantityField,
  Text,
  TextField,
} from '../index';

async function show(ui: ReactElement, language: 'en' | 'bn' = 'en') {
  await initI18n(language);
  return render(ui);
}

describe('Button', () => {
  it('is a button named by its label and reports presses', async () => {
    const onPress = jest.fn();
    await show(<Button label="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['disabled', { disabled: true }],
    ['loading', { loading: true }],
  ])('ignores presses while %s and says so to assistive technology', async (_state, props) => {
    const onPress = jest.fn();
    await show(<Button label="Save" onPress={onPress} {...props} />);

    const button = screen.getByRole('button', { name: 'Save' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('marks a loading button as busy', async () => {
    await show(<Button label="Save" onPress={jest.fn()} loading />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeBusy();
  });
});

describe('IconButton', () => {
  it('has an accessible name even though it shows no text', async () => {
    const onPress = jest.fn();
    await show(<IconButton icon="settings" accessibilityLabel="Settings" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Badge', () => {
  it.each(['paid', 'partlyPaid', 'due', 'cancelled'] as const)(
    'always shows its status "%s" as text, not only as color',
    async (tone) => {
      await show(<Badge tone={tone} label={`status-${tone}`} />);
      expect(screen.getByText(`status-${tone}`)).toBeOnTheScreen();
    },
  );
});

describe('ConfidenceHighlight', () => {
  it('flags a field the parser was unsure about', async () => {
    await show(
      <ConfidenceHighlight confidence={0.6}>
        <Text>Karim</Text>
      </ConfidenceHighlight>,
    );
    expect(screen.getByText('Karim')).toBeOnTheScreen();
    expect(screen.getByText('Please check this')).toBeOnTheScreen();
  });

  it('leaves confident fields alone, including exactly at the threshold', async () => {
    await show(
      <ConfidenceHighlight confidence={0.75}>
        <Text>Karim</Text>
      </ConfidenceHighlight>,
    );
    expect(screen.queryByText('Please check this')).toBeNull();
  });

  it('speaks Bengali when the interface does', async () => {
    await show(
      <ConfidenceHighlight confidence={0.2}>
        <Text>করিম</Text>
      </ConfidenceHighlight>,
      'bn',
    );
    expect(screen.getByText('এটি মিলিয়ে নিন')).toBeOnTheScreen();
  });
});

describe('TextField', () => {
  it('shows its label, reports typing and announces an error', async () => {
    const onChangeText = jest.fn();
    await show(
      <TextField
        label="Shop name"
        value=""
        onChangeText={onChangeText}
        error="This is required."
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Rahim Store');
    expect(onChangeText).toHaveBeenCalledWith('Rahim Store');
    expect(screen.getByRole('alert')).toHaveTextContent('This is required.');
  });

  it('marks optional fields in words', async () => {
    await show(<TextField label="Phone" value="" onChangeText={jest.fn()} optional />);
    expect(screen.getByText('Phone (optional)')).toBeOnTheScreen();
  });
});

describe('AmountField', () => {
  it.each([
    ['2500', 'en', 250_000],
    ['2,500.5', 'en', 250_050],
    ['২,৫০০.৫০', 'bn', 250_050],
    ['', 'en', null],
    ['abc', 'en', null],
    ['1.234', 'en', null],
  ])('reports "%s" (%s) as %p minor units', async (typed, locale, expected) => {
    const onChange = jest.fn();
    await show(
      <AmountField label="Price" value={null} onChange={onChange} locale={locale} currency="BDT" />,
    );
    await fireEvent.changeText(screen.getByLabelText('Price'), typed);
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it('shows the stored amount formatted for the language', async () => {
    await show(
      <AmountField label="Price" value={250_050} onChange={jest.fn()} locale="bn" currency="BDT" />,
    );
    expect(screen.getByLabelText('Price')).toHaveDisplayValue('২,৫০০.৫০');
  });
});

describe('QuantityField', () => {
  it('steps by whole units and never below one', async () => {
    const onChange = jest.fn();
    await show(<QuantityField label="Quantity" value={2000} onChange={onChange} locale="en" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Increase: Quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(3000);
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease: Quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(1000);
  });

  it('disables the minus button at one unit and accepts typed fractions', async () => {
    const onChange = jest.fn();
    await show(<QuantityField label="Quantity" value={1000} onChange={onChange} locale="en" />);

    expect(screen.getByRole('button', { name: 'Decrease: Quantity' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '1.5');
    expect(onChange).toHaveBeenLastCalledWith(1500);
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '0');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('MicButton', () => {
  it('starts on press-in, stops on release and names its state in words', async () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    await show(<MicButton listening={false} onStart={onStart} onStop={onStop} />);

    const button = screen.getByRole('button', { name: 'Hold to talk' });
    await fireEvent(button, 'pressIn');
    expect(onStart).toHaveBeenCalledTimes(1);
    await fireEvent(button, 'pressOut');
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('shows the listening state as text', async () => {
    await show(<MicButton listening onStart={jest.fn()} onStop={jest.fn()} />);
    expect(screen.getByText('Listening… release when done')).toBeOnTheScreen();
  });

  it('lets screen-reader users toggle listening with a double tap', async () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    await show(<MicButton listening={false} onStart={onStart} onStop={onStop} />);

    await fireEvent(screen.getByRole('button', { name: 'Hold to talk' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });
});

describe('Banner and EmptyState', () => {
  it('render their text and run their action', async () => {
    const onPress = jest.fn();
    await show(
      <>
        <Banner
          tone="warning"
          title="Back up your data"
          message="Last backup was 9 days ago."
          action={{ label: 'Back up now', onPress }}
        />
        <EmptyState icon="customers" title="No customers yet" body="Add someone." />
      </>,
    );

    expect(screen.getByText('Last backup was 9 days ago.')).toBeOnTheScreen();
    expect(screen.getByText('No customers yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back up now' }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('initialsOf', () => {
  it('takes the first letters of up to two words in any script', () => {
    expect(initialsOf('Karim Uddin Ahmed')).toBe('KU');
    expect(initialsOf('rahim')).toBe('R');
    expect(initialsOf('করিম উদ্দিন')).toBe('কউ');
    expect(initialsOf('  ')).toBe('');
  });
});

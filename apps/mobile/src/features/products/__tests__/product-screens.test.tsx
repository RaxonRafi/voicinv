import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';

import { listProducts } from '../repository';
import { ProductFormScreen } from '../screens/product-form-screen';
import { ProductListScreen } from '../screens/product-list-screen';
import { createProduct, getProductDetails } from '../usecases';

describe('product screens', () => {
  let app: TestShopApp;

  beforeEach(async () => {
    app = await createTestShopApp();
  });

  afterEach(() => app.close());

  it('creates a product from the form', async () => {
    await renderWithApp(<ProductFormScreen />, app.services);

    await fireEvent.changeText(await screen.findByTestId('product-name'), 'Rice');
    await fireEvent.changeText(screen.getByTestId('product-unit'), 'bag');
    await fireEvent.changeText(screen.getByTestId('product-price'), '2,500');
    await fireEvent.changeText(screen.getByTestId('product-aliases'), 'চাল, chal');
    await fireEvent.press(screen.getByTestId('product-save'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    const [product] = await listProducts(app.db.orm);
    expect(product).toMatchObject({ name: 'Rice', unit: 'bag', defaultPrice: 250_000 });
    expect((await getProductDetails(app.db.orm, product?.id ?? ''))?.aliases).toEqual([
      'চাল',
      'chal',
    ]);
  });

  it('explains what is missing and saves nothing', async () => {
    await renderWithApp(<ProductFormScreen />, app.services);

    await fireEvent.press(await screen.findByTestId('product-save'));

    expect(await screen.findAllByText('This is required.')).toHaveLength(2);
    expect(await listProducts(app.db.orm)).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('reports a duplicate name on the name field', async () => {
    await createProduct(app.ctx, { name: 'Rice', unit: 'bag', defaultPrice: null, aliases: [] });
    await renderWithApp(<ProductFormScreen />, app.services);

    await fireEvent.changeText(await screen.findByTestId('product-name'), 'rice');
    await fireEvent.changeText(screen.getByTestId('product-unit'), 'kg');
    await fireEvent.press(screen.getByTestId('product-save'));

    expect(await screen.findByText('This already exists.')).toBeOnTheScreen();
    expect(await listProducts(app.db.orm)).toHaveLength(1);
  });

  it('loads an existing product into the form for editing', async () => {
    const product = await createProduct(app.ctx, {
      name: 'Rice',
      unit: 'bag',
      defaultPrice: 250_000,
      aliases: ['চাল'],
    });
    await renderWithApp(<ProductFormScreen productId={product.id} />, app.services);

    expect(await screen.findByTestId('product-name')).toHaveDisplayValue('Rice');
    expect(screen.getByTestId('product-price')).toHaveDisplayValue('2,500');
    expect(screen.getByTestId('product-aliases')).toHaveDisplayValue('চাল');

    await fireEvent.changeText(screen.getByTestId('product-price'), '2700');
    await fireEvent.press(screen.getByTestId('product-save'));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await getProductDetails(app.db.orm, product.id))?.product.defaultPrice).toBe(270_000);
  });

  it('lists products with their price and updates when one is added', async () => {
    await createProduct(app.ctx, { name: 'Rice', unit: 'bag', defaultPrice: 250_000, aliases: [] });
    await renderWithApp(<ProductListScreen />, app.services);

    expect(await screen.findByText('Rice')).toBeOnTheScreen();
    expect(screen.getByText('৳2,500 per bag')).toBeOnTheScreen();

    await createProduct(app.ctx, { name: 'Oil', unit: 'litre', defaultPrice: null, aliases: [] });
    expect(await screen.findByText('Oil')).toBeOnTheScreen();
    expect(screen.getByText('litre · No fixed price')).toBeOnTheScreen();
  });

  it('shows an inviting empty state before any product exists', async () => {
    await renderWithApp(<ProductListScreen />, app.services);
    expect(await screen.findByText('No products yet')).toBeOnTheScreen();
  });
});

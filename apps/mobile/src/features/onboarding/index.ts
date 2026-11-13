// Public API of the onboarding feature.
export { OnboardingScreen } from './screens/onboarding-screen';
export { SHOP_TEMPLATES, SHOP_TYPES, type ShopType } from './templates';
export {
  completeOnboarding,
  type OnboardingContext,
  type OnboardingInput,
  onboardingInputSchema,
} from './usecases';

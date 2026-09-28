import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

export const REVENUECAT_ENTITLEMENT_ID = 'amodka_premium';

export type BillingPlan = 'monthly' | 'annual';
export type BillingErrorCategory =
  | 'unavailable'
  | 'not_authenticated'
  | 'cancelled'
  | 'pending'
  | 'wrong_account'
  | 'configuration'
  | 'network'
  | 'failed'
  | 'identity_changed';

export interface BillingPlanOption {
  plan: BillingPlan;
  productId: string;
  localizedPrice: string;
  trialDescription: string | null;
  package: PurchasesPackage;
}

export interface BillingAvailability {
  available: boolean;
  reason: 'ready' | 'expo_go' | 'unsupported_platform' | 'missing_configuration' | 'native_module_unavailable';
}

const isExpoGo = Constants.executionEnvironment === 'storeClient';
let configured = false;
let activeAppUserId: string | null = null;
let wrongAccountRecoveryUserId: string | null = null;
let identityOperation: Promise<void> = Promise.resolve();

function publicConfiguration() {
  const ios = Platform.OS === 'ios';
  if (!ios && Platform.OS !== 'android') return null;
  const apiKey = ios
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const monthlyProductId = ios
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT_ID
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID;
  const annualProductId = ios
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_ANNUAL_PRODUCT_ID
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID;
  return apiKey && monthlyProductId && annualProductId
    ? { apiKey, productIds: { monthly: monthlyProductId, annual: annualProductId } }
    : null;
}

export function getBillingAvailability(): BillingAvailability {
  if (isExpoGo) return { available: false, reason: 'expo_go' };
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { available: false, reason: 'unsupported_platform' };
  }
  if (!publicConfiguration()) return { available: false, reason: 'missing_configuration' };
  try {
    if (typeof Purchases.configure !== 'function') {
      return { available: false, reason: 'native_module_unavailable' };
    }
  } catch {
    return { available: false, reason: 'native_module_unavailable' };
  }
  return { available: true, reason: 'ready' };
}

function enqueueIdentityOperation(operation: () => Promise<void>): Promise<void> {
  identityOperation = identityOperation.then(operation, operation);
  return identityOperation;
}

async function setRevenueCatIdentityNow(userId: string | null): Promise<void> {
  const availability = getBillingAvailability();
  if (!availability.available) return;

  if (!userId) {
    if (configured && activeAppUserId) {
      await Purchases.logOut();
      activeAppUserId = null;
    }
    wrongAccountRecoveryUserId = null;
    return;
  }

  if (wrongAccountRecoveryUserId === userId) {
    throw new RevenueCatBillingError('wrong_account');
  }
  const configuration = publicConfiguration();
  if (!configuration) return;
  if (!configured) {
    Purchases.configure({ apiKey: configuration.apiKey, appUserID: userId });
    configured = true;
    activeAppUserId = userId;
    return;
  }
  if (activeAppUserId === userId) return;

  if (activeAppUserId) await Purchases.logOut();
  const loginResult = await Purchases.logIn(userId);
  if (loginResult.customerInfo.originalAppUserId &&
      loginResult.customerInfo.originalAppUserId !== userId &&
      !loginResult.customerInfo.originalAppUserId.startsWith('$RCAnonymousID:')) {
    activeAppUserId = userId;
    wrongAccountRecoveryUserId = userId;
    throw new RevenueCatBillingError('wrong_account');
  }
  activeAppUserId = userId;
  wrongAccountRecoveryUserId = null;
}

export function setRevenueCatIdentity(userId: string | null): Promise<void> {
  return enqueueIdentityOperation(() => setRevenueCatIdentityNow(userId));
}

export class RevenueCatBillingError extends Error {
  constructor(readonly category: BillingErrorCategory) {
    super(category);
    this.name = 'RevenueCatBillingError';
  }
}

export function getBillingErrorCategory(error: unknown): BillingErrorCategory {
  if (error instanceof RevenueCatBillingError) return error.category;
  const rcError = error as { code?: string | number; userCancelled?: boolean } | null;
  const codes = Purchases.PURCHASES_ERROR_CODE;
  if (rcError?.userCancelled || rcError?.code === codes.PURCHASE_CANCELLED_ERROR) return 'cancelled';
  if (rcError?.code === codes.PAYMENT_PENDING_ERROR) return 'pending';
  if (rcError?.code === codes.RECEIPT_ALREADY_IN_USE_ERROR ||
      rcError?.code === codes.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR) return 'wrong_account';
  if (rcError?.code === codes.NETWORK_ERROR) return 'network';
  if (rcError?.code === codes.INVALID_CREDENTIALS_ERROR ||
      rcError?.code === codes.CONFIGURATION_ERROR) return 'configuration';
  return 'failed';
}

function formatTrial(product: PurchasesPackage['product']): string | null {
  const offer = product.introPrice;
  if (!offer || offer.price !== 0 || !Number.isFinite(offer.periodNumberOfUnits) ||
      !Number.isFinite(offer.cycles) || offer.periodNumberOfUnits < 1 || offer.cycles < 1) return null;
  const count = offer.periodNumberOfUnits * offer.cycles;
  const period = offer.periodUnit.toLowerCase();
  return `Free for ${count} ${period}${count === 1 ? '' : 's'}`;
}

export async function getBillingPlans(userId: string): Promise<BillingPlanOption[]> {
  if (!userId) throw new RevenueCatBillingError('not_authenticated');
  const availability = getBillingAvailability();
  if (!availability.available) throw new RevenueCatBillingError('unavailable');
  await setRevenueCatIdentity(userId);
  if (activeAppUserId !== userId) throw new RevenueCatBillingError('not_authenticated');

  try {
    const configuration = publicConfiguration();
    if (!configuration) throw new RevenueCatBillingError('configuration');
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    return (['monthly', 'annual'] as const).flatMap(plan => {
      const productId = configuration.productIds[plan];
      const match = current.availablePackages.find(
        availablePackage => availablePackage.product.identifier === productId,
      );
      return match
        ? [{
            plan,
            productId,
            localizedPrice: match.product.priceString,
            trialDescription: formatTrial(match.product),
            package: match,
          }]
        : [];
    });
  } catch (error) {
    if (error instanceof RevenueCatBillingError) throw error;
    throw new RevenueCatBillingError(getBillingErrorCategory(error));
  }
}

export async function purchaseBillingPlan(
  userId: string,
  plan: BillingPlan,
  availablePlans: BillingPlanOption[],
): Promise<'purchased' | 'pending'> {
  if (!userId) throw new RevenueCatBillingError('not_authenticated');
  await setRevenueCatIdentity(userId);
  if (!getBillingAvailability().available) throw new RevenueCatBillingError('unavailable');
  if (activeAppUserId !== userId) throw new RevenueCatBillingError('not_authenticated');
  const option = availablePlans.find(candidate => candidate.plan === plan);
  if (!option) throw new RevenueCatBillingError('configuration');
  try {
    const result = await Purchases.purchasePackage(option.package);
    const entitlement = result.customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID];
    // CustomerInfo is intentionally only used to classify processing state.
    // Premium access is granted exclusively after the authenticated server check.
    return entitlement ? 'purchased' : 'pending';
  } catch (error) {
    const category = getBillingErrorCategory(error);
    if (category === 'cancelled' || category === 'pending' || category === 'wrong_account') {
      throw new RevenueCatBillingError(category);
    }
    throw new RevenueCatBillingError(category);
  }
}

function assertSameAmodkaAccount(
  customerInfo: Awaited<ReturnType<typeof Purchases.restorePurchases>>,
  userId: string,
) {
  const originalAppUserId = customerInfo.originalAppUserId;
  if (originalAppUserId && originalAppUserId !== userId &&
      !originalAppUserId.startsWith('$RCAnonymousID:')) {
    throw new RevenueCatBillingError('wrong_account');
  }
}

export async function restoreBillingPurchases(userId: string): Promise<void> {
  if (!userId) throw new RevenueCatBillingError('not_authenticated');
  await setRevenueCatIdentity(userId);
  if (!getBillingAvailability().available) throw new RevenueCatBillingError('unavailable');
  if (activeAppUserId !== userId) throw new RevenueCatBillingError('not_authenticated');
  try {
    const customerInfo = await Purchases.restorePurchases();
    assertSameAmodkaAccount(customerInfo, userId);
  } catch (error) {
    throw new RevenueCatBillingError(getBillingErrorCategory(error));
  }
}

export async function presentRevenueCatCustomerCenter(userId: string): Promise<void> {
  if (!userId) throw new RevenueCatBillingError('not_authenticated');
  await setRevenueCatIdentity(userId);
  if (!getBillingAvailability().available || activeAppUserId !== userId) {
    throw new RevenueCatBillingError('unavailable');
  }
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch {
    throw new RevenueCatBillingError('failed');
  }
}
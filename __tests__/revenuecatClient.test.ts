import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const revenuecat = readFileSync('lib/revenuecat.ts', 'utf8');
const premiumScreen = readFileSync('app/premium.tsx', 'utf8');
const appContext = readFileSync('contexts/AppContext.tsx', 'utf8');
const queryClient = readFileSync('lib/query-client.ts', 'utf8');
const profileScreen = readFileSync('app/(tabs)/profile.tsx', 'utf8');

assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/);
assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY/);
assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT_ID/);
assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_IOS_ANNUAL_PRODUCT_ID/);
assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID/);
assert.match(revenuecat, /EXPO_PUBLIC_REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID/);
assert.match(revenuecat, /'amodka_premium'/);
assert.match(revenuecat, /Constants\.executionEnvironment === 'storeClient'/);
assert.match(revenuecat, /Purchases\.configure\(\{ apiKey: configuration\.apiKey, appUserID: userId \}\)/);
assert.match(revenuecat, /Purchases\.logIn\(userId\)/);
assert.match(revenuecat, /Purchases\.logOut\(\)/);
assert.match(revenuecat, /availablePackage\.product\.identifier === productId/);
assert.match(revenuecat, /match\.product\.priceString/);
assert.match(revenuecat, /trialDescription: formatTrial\(match\.product\)/);
assert.match(revenuecat, /codes\.RECEIPT_ALREADY_IN_USE_ERROR/);
assert.match(revenuecat, /codes\.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR/);
assert.match(revenuecat, /RevenueCatUI\.presentCustomerCenter\(\)/);
assert.match(premiumScreen, /purchaseBillingPlan\(billingUserId, selectedPlan, plans\)/);
assert.match(premiumScreen, /restoreBillingPurchases\(billingUserId\)/);
assert.match(premiumScreen, /authenticatedApiRequest\('POST', '\/api\/user\/entitlements\/reconcile'\)/);
assert.match(premiumScreen, /error\.status === 409/);
assert.match(premiumScreen, /new RevenueCatBillingError\('wrong_account'\)/);
assert.match(premiumScreen, /assertAuthenticatedBillingIdentity\(userId, generation\)/);
assert.match(premiumScreen, /isCurrentBillingIdentity\(billingUserId, identityGeneration\)/);
assert.match(premiumScreen, /presentRevenueCatCustomerCenter\(billingUserId\)[\s\S]*?reconcileThenCheckServerAccess\(billingUserId, identityGeneration\)/);
assert.match(queryClient, /export async function authenticatedApiRequest/);
assert.match(premiumScreen, /refreshPremiumEntitlement\(\)/);
assert.match(premiumScreen, /authenticatedApiRequest\('GET', '\/api\/user\/billing\/readiness'\)/);
assert.match(premiumScreen, /readiness\.ready === true/);
assert.match(premiumScreen, /const serverReady = await isServerBillingReady\(\)/);
assert.match(premiumScreen, /disabled=\{working \|\| loadingPlans \|\| !serverBillingReady \|\| !plans\.length \|\| !isAuthenticated \|\| billingUserId !== authenticatedUserId\}/);
assert.match(premiumScreen, /No purchase was started/);
assert.match(premiumScreen, /Amodka billing is not currently ready/);
assert.match(profileScreen, /does not cancel your App Store or Google Play subscription/);
const purchaseHandler = premiumScreen.match(
  /const handlePurchase = async \(\) => \{([\s\S]*?)\n  \};/,
);
assert.ok(purchaseHandler, 'purchase action must have a server readiness guard');
assert.match(
  purchaseHandler[1],
  /const serverReady = await isServerBillingReady\(\);[\s\S]*?if \(!serverReady\)[\s\S]*?return;[\s\S]*?purchaseBillingPlan/,
);
assert.match(premiumScreen, /option\.localizedPrice/);
assert.match(premiumScreen, /option\.trialDescription/);
assert.match(appContext, /setRevenueCatIdentity\(null\)/);
assert.match(appContext, /setRevenueCatIdentity\(userId\)/);
assert.match(appContext, /const entitlement = await fetchAuthoritativeEntitlement\(\)/);

const refreshMethod = appContext.match(
  /const refreshPremiumEntitlement = useCallback\(async \(rejectUnavailable = false\): Promise<boolean> => \{([\s\S]*?)\n  \}, \[\]\);/,
);
assert.ok(refreshMethod, 'the billing UI must update access only through AppContext');
assert.match(refreshMethod[1], /fetchAuthoritativeEntitlement\(\)/);
assert.doesNotMatch(refreshMethod[1], /RevenueCat|CustomerInfo/);

console.log('RevenueCat client billing contracts passed.');
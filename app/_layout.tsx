import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/contexts/AppContext";
import { EMAIL_CONFIRMED_KEY, createSessionFromUrl } from "@/lib/auth";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";

SplashScreen.preventAutoHideAsync();

const FADE_OPTIONS = {
  animation: 'fade' as const,
  animationDuration: Platform.select({ android: 220, default: 220 }),
  animationTypeForReplace: 'push' as const,
};

const MODAL_OPTIONS = {
  presentation: 'modal' as const,
  animation: Platform.select({
    android: 'slide_from_bottom' as const,
    default: 'default' as const,
  }),
};

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="welcome" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="add-item" options={{ headerShown: false, gestureEnabled: false, ...MODAL_OPTIONS }} />
      <Stack.Screen name="bulk-review" options={{ headerShown: false, gestureEnabled: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="premium" options={{ headerShown: false, ...MODAL_OPTIONS }} />
      <Stack.Screen name="item-detail" options={{ headerShown: false, ...MODAL_OPTIONS }} />
      <Stack.Screen name="outfit-ideas" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false, ...FADE_OPTIONS }} />
      <Stack.Screen name="auth/update-password" options={{ headerShown: false, ...FADE_OPTIONS }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Expo Go OAuth relay — runs on the web page that loads inside
  // ASWebAuthenticationSession after Google/Apple auth completes.
  //
  // Flow: signInWithGoogle (native, Expo Go) passes
  //   redirectTo = "https://<domain>?nativeCallback=exp://<devserver>"
  // Supabase validates the base domain (strips query params) and redirects to:
  //   https://<domain>?nativeCallback=exp://<devserver>&code=xxx
  // That page loads here.  We immediately set window.location to the exp:// URL
  // so ASWebAuthenticationSession (callbackURLScheme = 'exp') can intercept it
  // and resolve openAuthSessionAsync in the native app.
  // detectSessionInUrl is disabled (lib/supabase.ts) while nativeCallback is
  // present so Supabase doesn't race to consume the PKCE code first.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const nativeCallback = params.get('nativeCallback');
    const code = params.get('code');
    if (!nativeCallback || !code) return;
    // Only relay to known app schemes — never open arbitrary URLs.
    const decoded = decodeURIComponent(nativeCallback);
    if (!decoded.startsWith('auracloset://') && !decoded.startsWith('exp://')) return;
    const relay = new URLSearchParams();
    relay.set('code', code);
    const type = params.get('type');
    if (type) relay.set('type', type);
    window.location.href = `${decoded.split('?')[0]}?${relay.toString()}`;
  }, []);

  // On web, Supabase processes the confirmation redirect automatically via
  // detectSessionInUrl:true without calling createSessionFromUrl(). Inspect
  // window.location once at boot — before any navigation — and write the
  // one-time flag so the home screen banner can surface it.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    const fullUrl = window.location.search + window.location.hash;
    if (fullUrl.includes('type=signup')) {
      AsyncStorage.setItem(EMAIL_CONFIRMED_KEY, '1').catch(() => {});
    }
  }, []);

  // Android cold-start deep-link handler.
  //
  // When the user taps "Sign in with Google", the app opens the full Chrome
  // browser via Linking.openURL and attaches a Linking.addEventListener to
  // catch the auracloset:// callback.  That works as long as the app process
  // stays alive in the background.
  //
  // On memory-constrained Android devices the OS can kill the background app
  // process while Chrome is in the foreground.  When Google auth completes and
  // Chrome follows the auracloset:// redirect, Android relaunches the app as a
  // fresh process — the Linking event listener in auth.ts is never attached.
  //
  // In that scenario Linking.getInitialURL() returns the deep-link URL at
  // startup.  We detect the OAuth params here and exchange the PKCE code,
  // giving the user a seamless sign-in even after a cold restart.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (!url.startsWith('auracloset://')) return;
      if (!url.includes('code=') && !url.includes('access_token=')) return;
      createSessionFromUrl(url).catch(() => {});
    });
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AppProvider>
              <StatusBar style="dark" />
              <RootLayoutNav />
            </AppProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

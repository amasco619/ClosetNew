import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/contexts/AppContext";
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
      <Stack.Screen name="add-item" options={{ headerShown: false, ...MODAL_OPTIONS }} />
      <Stack.Screen name="bulk-import" options={{ headerShown: false, ...MODAL_OPTIONS }} />
      <Stack.Screen name="bulk-review" options={{ headerShown: false, ...FADE_OPTIONS }} />
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

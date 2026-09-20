import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FeedbackProvider } from "../src/feedback";
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FeedbackProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </FeedbackProvider>
    </SafeAreaProvider>
  );
}

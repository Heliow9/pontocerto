import { createContext, ReactNode, useContext, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
type Button = { text?: string; onPress?: () => void; style?: string };
type Message = { title: string; message?: string; buttons?: Button[] };
const Context = createContext({
  alert: (_title: string, _message?: string, _buttons?: Button[]) => {},
});
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  return (
    <Context.Provider
      value={{
        alert: (title, message, buttons) =>
          setMessage({ title, message, buttons }),
      }}
    >
      {children}
      <Modal
        visible={!!message}
        transparent
        animationType="fade"
        onRequestClose={() => setMessage(null)}
      >
        <SafeAreaView style={s.backdrop}>
          <View accessibilityViewIsModal style={s.card}>
            <ScrollView>
              <Text accessibilityRole="header" style={s.title}>
                {message?.title}
              </Text>
              <Text style={s.body}>{message?.message}</Text>
            </ScrollView>
            <View style={s.actions}>
              {(message?.buttons?.length
                ? message.buttons
                : [{ text: "Entendi" }]
              ).map((button, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={index}
                  style={s.button}
                  onPress={() => {
                    setMessage(null);
                    button.onPress?.();
                  }}
                >
                  <Text style={s.buttonText}>{button.text || "Continuar"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </Context.Provider>
  );
}
export const useFeedback = () => useContext(Context);
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,22,38,.55)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#172033",
    marginBottom: 14,
  },
  body: { fontSize: 16, lineHeight: 24, color: "#43536a" },
  actions: { gap: 10, marginTop: 20 },
  button: {
    minHeight: 48,
    backgroundColor: "#244a7d",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
});

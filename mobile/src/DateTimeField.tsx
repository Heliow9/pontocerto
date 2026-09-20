import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
export function DateTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const date = new Date(value);
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (Platform.OS === "web")
    return (
      <View>
        <Text style={{ fontSize: 15, marginBottom: 8 }}>
          Data e horário solicitados
        </Text>
        <input
          aria-label="Data e horário solicitados"
          type="datetime-local"
          value={value}
          min="2000-01-01T00:00"
          max="2100-12-31T23:59"
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: 14,
            border: "1px solid #bccbdd",
            borderRadius: 12,
            fontSize: 16,
            minHeight: 50,
            width: "100%",
          }}
        />
      </View>
    );
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 15 }}>Data e horário solicitados</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("date")}
        style={{
          padding: 16,
          minHeight: 50,
          backgroundColor: "white",
          borderRadius: 12,
        }}
      >
        <Text style={{ fontSize: 16 }}>
          Data: {valid.toLocaleDateString("pt-BR")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("time")}
        style={{
          padding: 16,
          minHeight: 50,
          backgroundColor: "white",
          borderRadius: 12,
        }}
      >
        <Text style={{ fontSize: 16 }}>
          Horário: {pad(valid.getHours())}:{pad(valid.getMinutes())}
        </Text>
      </Pressable>
      {mode && (
        <DateTimePicker
          value={valid}
          mode={mode}
          is24Hour
          onChange={(_, selected) => {
            setMode(null);
            if (selected)
              onChange(
                `${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}T${pad(selected.getHours())}:${pad(selected.getMinutes())}`,
              );
          }}
        />
      )}
    </View>
  );
}

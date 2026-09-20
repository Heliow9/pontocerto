import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type DaySummary = {
  work_date: string;
  expected_minutes: number;
  worked_minutes: number;
  time_bank_minutes: number;
  processed_at: string;
};
export function hours(minutes: number) {
  const n = Math.abs(Math.round(Number(minutes) || 0));
  return `${minutes < 0 ? "−" : ""}${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}min`;
}
export function DayTotals({ summary }: { summary?: DaySummary }) {
  return (
    <View style={s.totals}>
      {summary ? (
        <>
          <Text style={s.title}>Apuração do dia</Text>
          <Text style={s.body}>
            Previsto: {hours(summary.expected_minutes)} · Trabalhado:{" "}
            {hours(summary.worked_minutes)}
          </Text>
          <Text style={s.body}>
            Saldo do dia: {hours(summary.time_bank_minutes)}
          </Text>
          <Text style={s.caption}>
            Previsto é a carga da jornada. Trabalhado é o tempo apurado. Saldo
            segue as regras da empresa; não representa o banco acumulado.
          </Text>
          <Text style={s.caption}>
            Calculado em {summary.processed_at?.slice(0, 16).replace("T", " ")}.
            Alterações posteriores dependem de nova apuração pelo RH.
          </Text>
        </>
      ) : (
        <Text style={s.caption}>
          Horas previstas, trabalhadas e saldo estarão disponíveis após a
          apuração do RH.
        </Text>
      )}
    </View>
  );
}
export function HistoryCalendar({
  today,
  days,
  counts,
  selected,
  onSelect,
}: {
  today: string;
  days: number;
  counts: Record<string, number>;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const anchor = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  anchor.setUTCMonth(anchor.getUTCMonth() + offset);
  const month = anchor.toISOString().slice(0, 7);
  const length = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const minimum = new Date(`${today}T12:00:00Z`);
  minimum.setUTCDate(minimum.getUTCDate() - days + 1);
  const min = minimum.toISOString().slice(0, 10);
  return (
    <View style={s.calendar}>
      <View style={s.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
          disabled={month <= min.slice(0, 7)}
          onPress={() => setOffset(offset - 1)}
          style={s.arrow}
        >
          <Text>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={s.title}>
          {anchor.toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          disabled={offset >= 0}
          onPress={() => setOffset(offset + 1)}
          style={s.arrow}
        >
          <Text>›</Text>
        </Pressable>
      </View>
      <View style={s.grid}>
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <Text key={`week-${i}`} style={s.weekday}>
            {d}
          </Text>
        ))}
        {Array.from({ length: anchor.getUTCDay() }, (_, i) => (
          <View key={`empty-${i}`} style={s.day} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`,
            disabled = date < min || date > today;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}/${month.slice(5)}/${month.slice(0, 4)}, ${counts[date] || 0} marcações`}
              accessibilityState={{ selected: selected === date, disabled }}
              disabled={disabled}
              onPress={() => onSelect(selected === date ? "" : date)}
              style={[
                s.day,
                selected === date && s.selected,
                disabled && { opacity: 0.3 },
              ]}
            >
              <Text
                style={[s.dayNumber, selected === date && { color: "white" }]}
              >
                {i + 1}
              </Text>
              <Text
                style={[s.caption, selected === date && { color: "white" }]}
              >
                {counts[date] ? `${counts[date]} pts` : "—"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.caption}>
        Toque em um dia para conferir. “—” significa nenhuma marcação nesta
        consulta; não indica falta ou folga.
      </Text>
      {selected !== "" && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect("")}
          style={s.clear}
        >
          <Text style={s.link}>Mostrar todos os dias</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  calendar: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 12,
    gap: 12,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrow: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf5f6",
    borderRadius: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: "14.2857%",
    textAlign: "center",
    color: "#526477",
    paddingVertical: 8,
  },
  day: {
    width: "14.2857%",
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  selected: { backgroundColor: "#007c88" },
  dayNumber: { fontSize: 16, fontWeight: "700", color: "#18334c" },
  title: { fontSize: 16, fontWeight: "700", color: "#18334c" },
  caption: { fontSize: 13, lineHeight: 19, color: "#526477" },
  body: { fontSize: 15, lineHeight: 23, color: "#243d52" },
  totals: {
    gap: 8,
    backgroundColor: "#edf5f6",
    padding: 14,
    borderRadius: 14,
    marginVertical: 8,
  },
  clear: { minHeight: 48, justifyContent: "center" },
  link: { fontSize: 15, fontWeight: "700", color: "#007c88" },
});

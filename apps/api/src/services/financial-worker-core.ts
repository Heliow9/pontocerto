export function shouldGenerateMonthly(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida.");
  return date.endsWith("-01");
}
export function financialWorkerDateContext(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Data inválida.");
  return { date, competence: date.slice(0, 7), generateMonthly: shouldGenerateMonthly(date) };
}

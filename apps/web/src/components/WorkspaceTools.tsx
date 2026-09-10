import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

export const pageGuides: Record<string, { purpose: string; steps: string[] }> =
  {
    dashboard: {
      purpose:
        "Seu ponto de partida para acompanhar a equipe e resolver o que está pendente.",
      steps: [
        "Veja os indicadores e as marcações mais recentes.",
        "Abra Solicitações de ajuste para analisar correções enviadas pelos funcionários.",
        "Ao fechar o período, use Relatórios para conferir as horas e preparar a folha.",
      ],
    },
    employees: {
      purpose:
        "Organize quem trabalha na empresa e como cada pessoa pode registrar o ponto.",
      steps: [
        "Cadastre os dados do funcionário e escolha a empresa.",
        "Vincule a jornada e os locais onde ele pode registrar o ponto.",
        "Configure o acesso ao aplicativo. Os filtros ajudam a encontrar cadastros com pendências.",
      ],
    },
    points: {
      purpose: "Consulte as entradas e saídas registradas pela equipe.",
      steps: [
        "Escolha o período e, se necessário, um funcionário. Clique em Filtrar.",
        "Use Detalhes de segurança para conferir localização, jornada e validação do aparelho.",
        "Se precisar incluir uma marcação, use Ponto manual e informe uma justificativa.",
      ],
    },
    reports: {
      purpose:
        "Confira as horas trabalhadas ou prepare um arquivo para a contabilidade.",
      steps: [
        "Espelho mensal: escolha funcionário e período, visualize o resultado e baixe o PDF.",
        "Exportar para ERP: siga as etapas de período, funcionários, códigos da folha e conferência.",
        "Rubrica é o código que identifica um evento na folha, como horas extras. A contabilidade fornece esses códigos.",
      ],
    },
    adjustments: {
      purpose:
        "Analise pedidos de correção de ponto feitos pelos funcionários.",
      steps: [
        "Confira a data, o horário solicitado e o motivo.",
        "Compare com os registros existentes antes de decidir.",
        "Aprove ou rejeite conforme sua permissão. Resolva os pedidos do período antes de exportar para a folha.",
      ],
    },
    occurrences: {
      purpose:
        "Informe situações que explicam ausências, como férias, atestados e afastamentos.",
      steps: [
        "Escolha o funcionário e o tipo de ocorrência.",
        "Informe o período e o motivo.",
        "Confira a situação da solicitação: a apuração considera as ocorrências aprovadas.",
      ],
    },
    schedules: {
      purpose: "Defina os dias e horários esperados de trabalho.",
      steps: [
        "Cadastre a jornada da empresa e seus horários de entrada e saída.",
        "Marque as folgas e confira a carga horária.",
        "Vincule a jornada ao funcionário em Funcionários.",
      ],
    },
    locations: {
      purpose: "Defina os lugares onde a equipe pode registrar o ponto.",
      steps: [
        "Informe a empresa e localize o endereço no mapa.",
        "Configure a distância permitida e a regra de registro fora da área.",
        "Vincule o local aos funcionários que trabalham nele.",
      ],
    },
    companies: {
      purpose: "Mantenha os dados da empresa e as regras para registrar ponto.",
      steps: [
        "Preencha os dados da empresa e seu endereço.",
        "Revise as opções de localização, aparelho e jornada.",
        "Depois, cadastre locais, jornadas e funcionários.",
      ],
    },
    settings: {
      purpose: "Personalize as configurações da sua organização.",
      steps: [
        "Revise os dados e textos utilizados nos relatórios.",
        "Altere somente os campos necessários e salve.",
        "Confira o resultado em Relatórios.",
      ],
    },
    password: {
      purpose: "Altere a senha da sua própria conta.",
      steps: [
        "Informe a senha atual.",
        "Escolha uma nova senha e confirme o mesmo valor.",
        "Use a nova senha no próximo acesso.",
      ],
    },
  };
export function WorkspaceTools({
  page,
  links,
}: {
  page: string;
  links: { id: string; label: string; group: string }[];
}) {
  const [mode, setMode] = useState<"search" | "help" | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mode !== "search") return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const results = links.filter((link) =>
    normalize(
      `${link.label} ${pageGuides[link.id]?.purpose || ""} ${pageGuides[link.id]?.steps.join(" ") || ""}`,
    ).includes(normalize(query.trim())),
  );
  const guide = pageGuides[page] || {
    purpose: "Administre as organizações e os acessos do sistema.",
    steps: [
      "Localize o cadastro desejado.",
      "Confira os dados antes de salvar alterações.",
    ],
  };
  return (
    <div className="workspace-tools">
      <button
        className="workspace-search"
        aria-label="Encontrar uma função"
        onClick={() => {
          setQuery("");
          setMode("search");
        }}
      >
        <Icon name="search" />
        <span>Encontrar uma função</span>
      </button>
      <button
        className="workspace-help"
        aria-label="Como usar esta página"
        onClick={() => setMode("help")}
      >
        <Icon name="help" />
        <span>Como usar</span>
      </button>
      {mode && (
        <Modal
          title={
            mode === "search"
              ? "O que você precisa fazer?"
              : "Como usar esta página"
          }
          onClose={() => setMode(null)}
          protectChanges={false}
        >
          {mode === "search" ? (
            <div className="function-finder">
              <label>
                Buscar uma função
                <input
                  ref={searchRef}
                  type="search"
                  placeholder="Ex.: funcionário, folha, senha..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <p className="muted" aria-live="polite">
                {results.length}{" "}
                {results.length === 1
                  ? "função encontrada"
                  : "funções encontradas"}
              </p>
              <div className="function-results">
                {results.map((link) => (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={() => setMode(null)}
                  >
                    <Icon name={link.id} />
                    <div>
                      <strong>{link.label}</strong>
                      <small>
                        {pageGuides[link.id]?.purpose || link.group}
                      </small>
                    </div>
                    <Icon name="arrow" />
                  </a>
                ))}
              </div>
              {!results.length && (
                <p>
                  Nenhum resultado. Tente “relatório”, “ponto” ou “funcionário”.
                </p>
              )}
            </div>
          ) : (
            <div className="page-guide">
              <p className="guide-purpose">{guide.purpose}</p>
              <ol>
                {guide.steps.map((step, i) => (
                  <li key={step}>
                    <span>{i + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <button className="primary" onClick={() => setMode(null)}>
                Entendi, continuar
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

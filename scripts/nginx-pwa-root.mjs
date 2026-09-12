import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function findPwaRoot(config, domain) {
  const tokens =
    config
      .replace(/^\s*#.*$/gm, "")
      .match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s{};]+|[{};]/g) || [];
  let index = 0;
  function parse() {
    const nodes = [];
    while (index < tokens.length) {
      if (tokens[index] === "}") {
        index++;
        break;
      }
      const args = [];
      while (index < tokens.length && !["{", "}", ";"].includes(tokens[index]))
        args.push(tokens[index++].replace(/^['"]|['"]$/g, ""));
      const end = tokens[index++];
      if (args.length)
        nodes.push({
          name: args[0],
          args: args.slice(1),
          children: end === "{" ? parse() : null,
        });
    }
    return nodes;
  }
  const roots = [];
  function visit(nodes, inherited) {
    const root =
      nodes.find((n) => n.name === "root" && !n.children)?.args[0] || inherited;
    for (const node of nodes) {
      if (node.name === "server" && node.children) {
        const names = node.children
          .filter((n) => n.name === "server_name")
          .flatMap((n) => n.args);
        if (names.includes(domain)) {
          const sroot =
            node.children.find((n) => n.name === "root")?.args[0] || root;
          const location = node.children.find(
            (n) => n.name === "location" && n.args.join(" ") === "/",
          );
          if (location?.children?.some((n) => n.name === "proxy_pass"))
            throw new Error(
              "O PWA usa proxy_pass; confira a configuração antes de publicar.",
            );
          const destination =
            location?.children?.find(
              (n) => n.name === "root" || n.name === "alias",
            )?.args[0] || sroot;
          if (destination) roots.push(destination);
        }
      }
      if (node.children) visit(node.children, root);
    }
  }
  visit(parse(), null);
  const unique = [...new Set(roots)];
  if (
    unique.length !== 1 ||
    !path.posix.isAbsolute(unique[0]) ||
    unique[0].includes("$") ||
    unique[0] === "/"
  )
    throw new Error(
      "Não foi possível identificar uma única pasta estática do PWA neste domínio.",
    );
  return unique[0];
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const root = findPwaRoot(
      fs.readFileSync(0, "utf8"),
      process.argv[2] || "hubpontocerto.duckdns.org",
    );
    const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
    if (!index.includes("/_expo/"))
      throw new Error(
        "A pasta encontrada não contém o PWA Expo esperado. Nenhum arquivo foi copiado.",
      );
    process.stdout.write(root);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

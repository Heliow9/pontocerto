import { readFileSync } from "node:fs";

const configuration = readFileSync(0, "utf8");
const locationPattern = /location\s+\^~\s+\/api\/control-id\/device\/\s*\{/g;
const match = locationPattern.exec(configuration);

function locationBody(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return "";
}

const body = match ? locationBody(configuration, configuration.indexOf("{", match.index)) : "";
if (!match || !/\baccess_log\s+off\s*;/i.test(body)) {
  process.stderr.write(
    "A rota secreta Control iD exige `location ^~ /api/control-id/device/` com `access_log off;`.\n",
  );
  process.exit(1);
}

process.stdout.write("Nginx protege URLs secretas Control iD de access logs.\n");

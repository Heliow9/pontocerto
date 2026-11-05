export type ControlIdDeviceUrls = {
  pushServer: string;
  pushEndpoint: string;
  resultEndpoint: string;
  monitorHost: string;
  monitorPort: string;
  monitorPath: string;
};

export function buildControlIdDeviceUrls(
  apiBase: string,
  credential: string,
  origin: string,
): ControlIdDeviceUrls {
  if (!/^[a-f0-9]{64}$/i.test(credential)) {
    throw new Error("Credencial do equipamento inválida.");
  }

  const base = new URL(apiBase, origin);
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/control-id/device/${credential.toLowerCase()}`;
  base.search = "";
  base.hash = "";
  const pushServer = base.toString().replace(/\/$/, "");
  const monitorPath = `${base.pathname.replace(/^\/+/, "")}/monitor`;

  return {
    pushServer,
    pushEndpoint: `${pushServer}/push`,
    resultEndpoint: `${pushServer}/result`,
    monitorHost: base.hostname,
    monitorPort: base.port || (base.protocol === "https:" ? "443" : "80"),
    monitorPath,
  };
}

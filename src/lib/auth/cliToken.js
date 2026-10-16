// Validates the CLI's machine-derived token (`x-9r-cli-token`).
//
// Presence of the header is NOT enough — the value must match this machine's
// derived token, otherwise any dashboard session could forge the header and
// bypass the password re-auth on sensitive routes (CWE-290).

import { getConsistentMachineId } from "@/shared/utils/machineId";

const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";

let cachedCliToken = null;

export async function getCliToken() {
  if (!cachedCliToken) cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

export async function hasValidCliToken(request) {
  const token = request.headers.get(CLI_TOKEN_HEADER);
  if (!token) return false;
  return token === await getCliToken();
}

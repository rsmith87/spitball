import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE = "Spitball";

export async function saveSecret(account, secret, platform) {
  if (platform !== "darwin") throw new Error(`Keychain storage is only implemented for macOS. Platform: ${platform}`);
  await deleteSecret(account, platform);
  await execFileAsync("security", ["add-generic-password", "-a", account, "-s", SERVICE, "-w", secret]);
}

export async function readSecret(account, platform) {
  if (platform !== "darwin") throw new Error(`Keychain storage is only implemented for macOS. Platform: ${platform}`);
  try {
    const result = await execFileAsync("security", ["find-generic-password", "-a", account, "-s", SERVICE, "-w"]);
    return result.stdout.trim();
  } catch (error) {
    if (typeof error?.code === "number" && error.code === 44) return undefined;
    throw error;
  }
}

export async function deleteSecret(account, platform) {
  if (platform !== "darwin") throw new Error(`Keychain storage is only implemented for macOS. Platform: ${platform}`);
  try {
    await execFileAsync("security", ["delete-generic-password", "-a", account, "-s", SERVICE]);
  } catch (error) {
    if (typeof error?.code === "number" && error.code === 44) return;
    throw error;
  }
}

export { registerGSDCommand } from "./commands/index.js";

export async function handleGSDCommand(
  ...args: Parameters<typeof import("./commands/dispatcher.js").handleGSDCommand>
) {
  const { handleGSDCommand: dispatch } = await import("./commands/dispatcher.js");
  return dispatch(...args);
}

export async function fireStatusViaCommand(
  ...args: Parameters<typeof import("./commands/handlers/core.js").fireStatusViaCommand>
) {
  const { fireStatusViaCommand: fireStatus } = await import(
    "./commands/handlers/core.js"
  );
  return fireStatus(...args);
}

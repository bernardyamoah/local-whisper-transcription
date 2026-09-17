import { spawn } from "node:child_process";

const port = Number(process.env.STUDIO_PORT || 8765);
const origin = `http://127.0.0.1:${port}`;
const children = new Set();
let stopping = false;

async function backendReady() {
  try {
    const response = await fetch(`${origin}/api/environment`);
    return response.ok;
  } catch {
    return false;
  }
}

function start(command, args) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

let backend;
if (!(await backendReady())) {
  backend = start("uv", ["run", "whisper-studio"]);
  const deadline = Date.now() + 30_000;
  while (!(await backendReady())) {
    if (backend.exitCode !== null) process.exit(backend.exitCode || 1);
    if (Date.now() >= deadline) {
      stop();
      throw new Error(`Backend did not start at ${origin}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const vite = start("vite", ["dev"]);

backend?.once("exit", (code) => {
  if (stopping) return;
  console.error(`Backend stopped with exit code ${code ?? 1}.`);
  stop();
  process.exitCode = code || 1;
});

vite.once("exit", (code) => {
  if (!stopping) {
    stop();
    process.exitCode = code || 0;
  }
});

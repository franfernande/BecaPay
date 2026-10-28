export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startScheduler } = await import("./lib/agent/scheduler");
    startScheduler();
  } catch (e) {
    // The root layout also starts the scheduler on first render.
    console.warn("[becapay] scheduler not started from instrumentation:", (e as Error).message);
  }
}

// Shared validators for path-segment ids. Routes that resolve to filesystem
// paths must reject anything outside this shape — otherwise `path.join`
// happily resolves "../../etc/passwd".

const WALKTHROUGH_ID = /^[a-z0-9_-]+$/;
const STEP_ID = /^[a-z0-9_]+$/;
const TAKE_ID = /^(master|take-[a-z0-9_-]+|master\.prev-[a-z0-9_.-]+)$/;

export function isValidWalkthroughId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && WALKTHROUGH_ID.test(id);
}

export function isValidStepId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && STEP_ID.test(id);
}

export function isValidTakeId(id: string): boolean {
  return id.length > 0 && id.length <= 96 && TAKE_ID.test(id);
}

export function assertWalkthroughId(id: string): void {
  if (!isValidWalkthroughId(id)) throw new Error(`invalid walkthrough id: ${id}`);
}

export function assertStepId(id: string): void {
  if (!isValidStepId(id)) throw new Error(`invalid step id: ${id}`);
}

export function assertTakeId(id: string): void {
  if (!isValidTakeId(id)) throw new Error(`invalid take id: ${id}`);
}

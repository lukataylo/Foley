// Shared validators for path-segment ids. Routes that resolve to filesystem
// paths must reject anything outside this shape — otherwise `path.join`
// happily resolves "../../etc/passwd".

const WALKTHROUGH_ID = /^[a-z0-9_-]+$/;
const STEP_ID = /^[a-z0-9_]+$/;

export function isValidWalkthroughId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && WALKTHROUGH_ID.test(id);
}

export function isValidStepId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && STEP_ID.test(id);
}

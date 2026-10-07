export function buildInfoText(): string {
  return `${__BUILD_LABEL__} · ${__BUILD_SHA__} · built ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC`;
}

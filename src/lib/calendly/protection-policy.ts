export const PROTECTION_FRESH_MS = 5 * 60_000
export function protectionFresh(value: { sincronizadaAt: Date | null; bloqueoToken: string | null; errorSincronizacion: boolean }, now: Date) {
  return !value.bloqueoToken && !value.errorSincronizacion && !!value.sincronizadaAt && value.sincronizadaAt.getTime() <= now.getTime() && now.getTime() - value.sincronizadaAt.getTime() < PROTECTION_FRESH_MS
}

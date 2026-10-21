import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import type { Repo } from './types.js';

const { url, secret, timeoutMs, maxIntentos, backoff } = config.webhook;

export const firmar = (cuerpo: string | Buffer) => createHmac('sha256', secret).update(cuerpo).digest('hex');

export function firmaValida(cuerpo: Buffer, recibida: string | undefined) {
  if (!recibida) return false;
  const a = Buffer.from(firmar(cuerpo));
  const b = Buffer.from(recibida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function despachar(repo: Repo, enviar: typeof fetch = fetch) {
  for (const ev of await repo.eventosPendientes()) {
    let ok = false;
    let codigoHttp: number | undefined;
    let error: string | undefined;
    try {
      const res = await enviar(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': firmar(ev.payload), 'X-Event-Id': ev.eventId },
        body: ev.payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      codigoHttp = res.status;
      ok = res.ok;
      if (!ok) error = `El sistema externo respondió ${res.status}`;
    } catch (e) {
      const causa = e instanceof Error && (e.cause as { code?: string } | undefined)?.code;
      error = e instanceof Error ? `${e.message}${causa ? ` (${causa})` : ''}` : 'Error de red';
    }
    const quedan = ev.intentos + 1 < maxIntentos;
    await repo.registrarIntento(ev.id, { ok, codigoHttp, error, reintentarEnSeg: !ok && quedan ? backoff[ev.intentos] : undefined });
  }
}

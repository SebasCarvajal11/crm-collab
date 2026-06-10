/**
 * Utilidad de reintento con backoff exponencial y jitter (ruido aleatorio) para llamadas de red.
 */

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: any) => boolean;
}

const defaultShouldRetry = (error: any): boolean => {
  // Reintentar si es un error de tipo TypeError (generalmente fallos de red en fetch)
  if (error instanceof TypeError) {
    return true;
  }
  // Si tiene un código de estado HTTP 5xx
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  // Códigos de error de red comunes en Node.js
  const code = error?.code;
  if (
    code &&
    [
      "ECONNRESET",
      "EADDRINUSE",
      "ECONNREFUSED",
      "EPIPE",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "EHOSTUNREACH",
    ].includes(code)
  ) {
    return true;
  }
  return false;
};

/**
 * Ejecuta una función asíncrona reintentándola en caso de fallos transitorios.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 150;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const backoffFactor = options.backoffFactor ?? 2;
  const jitter = options.jitter ?? true;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      let nextDelay = delayMs * Math.pow(backoffFactor, attempt - 1);
      nextDelay = Math.min(nextDelay, maxDelayMs);
      if (jitter) {
        // Multiplica el retraso por un factor aleatorio entre 0.5 y 1.5
        nextDelay = nextDelay * (0.5 + Math.random());
      }

      await new Promise((resolve) => setTimeout(resolve, nextDelay));
    }
  }
}
export default withRetry;

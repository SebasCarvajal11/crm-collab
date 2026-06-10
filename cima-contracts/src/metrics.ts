/**
 * metrics.ts — Helper centralizado de métricas Prometheus para todos los servicios CIMA CRM.
 *
 * Expone:
 *  - createServiceMetrics(serviceName): instancia aislada de prom-client Registry
 *    con las métricas estándar: http_requests_total, http_request_duration_seconds,
 *    worker_outbox_depth, stream_consumer_group_depth.
 *  - metricsMiddleware(registry): middleware Hono que monta GET /metrics.
 *
 * Uso:
 *   import { createServiceMetrics, metricsMiddleware } from
 *     "@sebascarvajal11/cima-contracts/metrics";
 *   const metrics = createServiceMetrics("crm-auth");
 *   app.route("/", metricsMiddleware(metrics.registry));
 *   // En cada worker:
 *   metrics.outboxDepthGauge.set({ worker: "identity-outbox" }, pendingCount);
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import type { Context, Next } from "hono";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type ServiceMetrics = {
  registry: Registry;
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  /** Gauge para la profundidad de la outbox DB de cada worker. */
  outboxDepthGauge: Gauge;
  /** Gauge para la profundidad del consumer group de un Redis Stream. */
  streamConsumerGroupDepth: Gauge;
  /** Counter de errores 5xx. */
  httpErrorsTotal: Counter;
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Crea una instancia aislada de métricas para el servicio indicado.
 * Todas las métricas tienen el label `service` fijado al nombre del servicio.
 * Llámalo una sola vez al inicio del proceso.
 */
export function createServiceMetrics(serviceName: string): ServiceMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });

  // Incluye métricas por defecto de Node.js (event loop lag, heap, GC…)
  collectDefaultMetrics({ register: registry });

  const httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total de peticiones HTTP recibidas",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "Duración de peticiones HTTP en segundos (p50/p95/p99)",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const httpErrorsTotal = new Counter({
    name: "http_errors_5xx_total",
    help: "Total de respuestas HTTP 5xx",
    labelNames: ["method", "route"],
    registers: [registry],
  });

  const outboxDepthGauge = new Gauge({
    name: "worker_outbox_depth",
    help: "Número de registros pendientes en la outbox DB de cada worker",
    labelNames: ["worker"],
    registers: [registry],
  });

  const streamConsumerGroupDepth = new Gauge({
    name: "stream_consumer_group_depth",
    help: "Mensajes pendientes (PEL) en el consumer group de un Redis Stream",
    labelNames: ["stream", "group"],
    registers: [registry],
  });

  return {
    registry,
    httpRequestsTotal,
    httpRequestDuration,
    httpErrorsTotal,
    outboxDepthGauge,
    streamConsumerGroupDepth,
  };
}

// ── Middleware Hono ───────────────────────────────────────────────────────────

/**
 * Monta el endpoint GET /metrics (formato Prometheus text/plain).
 * Registra automáticamente duración, conteo y errores 5xx para cada request.
 *
 * Uso:
 *   app.route("/", metricsMiddleware(metrics.registry));
 *   app.use("*", httpMetricsMiddleware(metrics));
 */
export function metricsEndpointHandler(registry: Registry) {
  return async (c: Context) => {
    const text = await registry.metrics();
    return c.text(text, 200, {
      "Content-Type": registry.contentType,
    });
  };
}

/**
 * Middleware global que instrumenta cada request con conteo y duración.
 * Debe montarse antes de las rutas de negocio.
 */
export function httpMetricsMiddleware(metrics: ServiceMetrics) {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    await next();
    const durationSec = (Date.now() - start) / 1000;
    const method = c.req.method;
    // Normaliza la ruta (elimina IDs dinámicos para evitar cardinalidad alta)
    const route = normalizeRoute(c.req.path);
    const statusCode = String(c.res.status);

    metrics.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    metrics.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      durationSec
    );
    if (c.res.status >= 500) {
      metrics.httpErrorsTotal.inc({ method, route });
    }
  };
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/**
 * Reemplaza segmentos que parecen UUIDs o IDs numéricos por `:id`
 * para evitar explosión de cardinalidad en las etiquetas.
 */
function normalizeRoute(path: string): string {
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/:id"
    )
    .replace(/\/\d+/g, "/:id");
}

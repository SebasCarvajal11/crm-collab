/**
 * Convenciones oficiales para nombres de Redis Streams y Consumer Groups en la plataforma CIMA CRM.
 * Todas las constantes de interoperabilidad del bus de eventos se centralizan aquí.
 */

export const STREAM_CONVENTIONS = {
  streams: {
    identity: {
      events: "stream:auth.identity",
      replayRequests: "stream:auth.identity-replay-requests",
    },
    collab: {
      events: "stream:collab.events",
      mediaCommands: "stream:collab.media-commands",
      identityDlq: "stream:collab.identity-dlq",
    },
    media: {
      assetResponses: "stream:media.asset-responses",
      commandsDlq: "stream:media.commands-dlq",
    },
    audit: {
      events: "stream:audit.events",
    },
  },
  groups: {
    collab: {
      authIdentity: "group:collab.auth-identity",
      mediaResponses: "group:collab.media-responses",
      events: "group:collab.events",
    },
    auth: {
      identityReplayRequests: "group:auth.identity-replay-requests",
    },
    media: {
      commands: "group:media.commands",
      authIdentity: "group:crm-media.auth.identity",
    },
  },
} as const;

/**
 * Deriva dinámicamente un nombre de stream en base al dominio del contrato y la versión mayor.
 */
export function deriveStreamName(domain: "auth" | "collab" | "media", name: string, version: number): string {
  return `stream:${domain}.${name}.v${version}`;
}

/**
 * Deriva dinámicamente un nombre de grupo de consumidores.
 */
export function deriveConsumerGroupName(service: string, streamName: string): string {
  // Elimina el prefijo 'stream:' si existe
  const cleanedStream = streamName.startsWith("stream:") ? streamName.substring(7) : streamName;
  return `group:${service}.${cleanedStream}`;
}

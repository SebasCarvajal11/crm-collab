export type MediaCommandActor = {
  sub: string;
  userId: string;
  role: string;
  email: string;
};

export type UnsignedMediaCommandRequest =
  | {
      type: "file.upload-url-requested";
      traceId?: string;
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      type: "file.metadata-requested";
      traceId?: string;
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  | {
      type: "file.access-requested";
      traceId?: string;
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
      forceDownload: boolean;
    }
  | {
      type: "file.delete-requested";
      traceId?: string;
      correlationId: string;
      requestedAt: string;
      actor: MediaCommandActor;
      objectKey: string;
    };

export type MediaCommandRequest = UnsignedMediaCommandRequest & {
  signature: string;
};

export type MediaCommandResponse =
  | {
      type: "file.upload-url-created";
      version: number;
      contractVersion: number;
      correlationId: string;
      objectKey: string;
      uploadUrl: string;
      expiresInSeconds: number;
    }
  | {
      type: "file.metadata-resolved";
      version: number;
      contractVersion: number;
      correlationId: string;
      objectKey: string;
      sizeBytes: number;
      mimeType: string;
    }
  | {
      type: "file.access-granted";
      version: number;
      contractVersion: number;
      correlationId: string;
      objectKey: string;
      url: string;
      expiresInSeconds: number;
    }
  | {
      type: "file.deleted";
      version: number;
      contractVersion: number;
      correlationId: string;
      objectKey: string;
    }
  | {
      type: "file.command-failed";
      version: number;
      contractVersion: number;
      correlationId: string;
      objectKey?: string;
      statusCode: number;
      message: string;
    };

export type PendingResponse = {
  resolve: (response: MediaCommandResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

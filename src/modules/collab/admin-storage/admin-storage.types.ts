export type FileFolder =
  | "contracts"
  | "final_arts"
  | "mockups"
  | "briefs"
  | "shared_deliverables";

export interface StorageFileItem {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  title: string | null;
  folder: FileFolder;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  isClientVisible: boolean;
  isPurged: boolean;
  purgedAt: Date | null;
  purgedReason: string | null;
  createdByEmail: string | null;
  createdAt: Date;
  taskId: string | null;
  taskTitle: string | null;
  isSignedContract: boolean;
}

export interface StorageFolderSummary {
  folderKey: FileFolder;
  folderLabel: string;
  totalFiles: number;
  totalBytes: number;
  files: StorageFileItem[];
}

export interface StorageProjectSummary {
  projectId: string;
  projectName: string;
  projectType: string;
  projectStatus: string;
  isArchived: boolean;
  totalFiles: number;
  totalBytes: number;
  folders: Record<string, StorageFolderSummary>;
}

export interface StorageClientSummary {
  clientSub: string;
  clientName: string;
  totalFiles: number;
  totalBytes: number;
  projectsCount: number;
  projects: StorageProjectSummary[];
}

export interface StorageGlobalSummary {
  totalClients: number;
  totalProjects: number;
  totalFiles: number;
  totalBytes: number;
  purgedFilesCount: number;
  purgedBytes: number;
}

export interface StorageTreeResponse {
  summary: StorageGlobalSummary;
  clients: StorageClientSummary[];
}

export interface PurgeBatchInput {
  fileIds?: string[];
  projectId?: string;
  folder?: FileFolder;
  clientSub?: string;
  onlyFinishedProjects?: boolean;
  reason?: string;
  forcePurgeSigned?: boolean;
}

export interface PurgeResult {
  purgedCount: number;
  freedBytes: number;
  skippedSignedContractsCount: number;
}

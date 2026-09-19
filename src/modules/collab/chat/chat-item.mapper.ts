import type { ProjectMember } from "../collab.types";
import type { UserProfile } from "../../../shared/identity-snapshot-store";

type ReadInfo = {
  userSub: string;
  readAt: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  profession?: string | null;
  companyName?: string | null;
};

type MessageInput = {
  id: string;
  projectId: string;
  channel: "internal" | "external" | "system";
  authorSub: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: Date;
  mentionedSubs: string[];
};

type MapperContext = {
  readersByMessage: Map<string, Set<string>>;
  readsByMessage: Map<string, ReadInfo[]>;
  memberBySub: Map<string, ProjectMember>;
  visibleRecipients: ProjectMember[];
  profiles: Map<string, UserProfile>;
};

export function mapChatMessageItem(msg: MessageInput, ctx: MapperContext) {
  const readers = ctx.readersByMessage.get(msg.id) ?? new Set<string>();
  const msgReads = ctx.readsByMessage.get(msg.id) ?? [];
  const authorMember = msg.authorSub ? ctx.memberBySub.get(msg.authorSub) : undefined;
  const required = ctx.visibleRecipients
    .map((m) => m.userSub)
    .filter((sub) => sub !== msg.authorSub);
  const seenCount = required.filter((sub) => readers.has(sub)).length;
  const isSeen = required.length === 0 ? true : seenCount === required.length;
  const profile = msg.authorSub ? ctx.profiles.get(msg.authorSub) : undefined;

  return {
    ...msg,
    authorFirstName: profile?.firstName ?? null,
    authorLastName: profile?.lastName ?? null,
    authorRole: authorMember?.role ?? profile?.role ?? null,
    authorProfession: profile?.profession ?? null,
    readStatus: {
      isSeen,
      requiredCount: required.length,
      seenCount,
      reads: msgReads,
    },
  };
}

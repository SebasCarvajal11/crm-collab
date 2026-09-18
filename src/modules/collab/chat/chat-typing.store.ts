type ActiveTyper = {
  name: string;
  expiresAt: number;
};

const store = new Map<string, Map<string, ActiveTyper>>();

const getKey = (projectId: string, channel: string) => `${projectId}:${channel}`;

export const chatTypingStore = {
  setTyping: (projectId: string, channel: string, userSub: string, name: string, ttlMs = 4500): void => {
    const key = getKey(projectId, channel);
    let channelTypers = store.get(key);
    if (!channelTypers) {
      channelTypers = new Map();
      store.set(key, channelTypers);
    }
    channelTypers.set(userSub, { name, expiresAt: Date.now() + ttlMs });
  },

  getActiveTypers: (projectId: string, channel: string, excludeSub?: string): string[] => {
    const key = getKey(projectId, channel);
    const channelTypers = store.get(key);
    if (!channelTypers) return [];

    const now = Date.now();
    const activeNames: string[] = [];

    for (const [sub, data] of channelTypers.entries()) {
      if (data.expiresAt <= now) {
        channelTypers.delete(sub);
      } else if (sub !== excludeSub) {
        activeNames.push(data.name);
      }
    }

    if (channelTypers.size === 0) {
      store.delete(key);
    }

    return activeNames;
  },

  clear: (): void => {
    store.clear();
  },
};

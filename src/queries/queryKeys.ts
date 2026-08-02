export const queryKeys = {
  currentUser: () => ["users", "me"] as const,
  communities: () => ["communities"] as const,
  community: (id: number | string) => ["communities", id] as const,
  channel: (id: number | string) => ["channels", id] as const,
  messages: (communityId: string | number, channelIdentifier: string) =>
    ["messages", communityId, channelIdentifier] as const,
  message: (uuid: string) => ["message", uuid] as const,
  messageHistory: (messageIri: string) => ["messageHistory", messageIri] as const,
  channelPages: (communityId: string, channelIdentifier: string) =>
    ["channelPages", communityId, channelIdentifier] as const,
  pinnedMessages: (communityId: string, channelIdentifier: string) =>
    ["pinnedMessages", communityId, channelIdentifier] as const,
  threadReplies: (rootIri: string) => ["threadReplies", rootIri] as const,
  channelLatestPage: (communityId: string, channelIdentifier: string) =>
    ["channelLatestPage", communityId, channelIdentifier] as const,
  communityMembers: (communityId: string) => ["communities", communityId, "members"] as const,
  communityInvites: (communityId: string) => ["communities", communityId, "invites"] as const,
  invite: (token: string) => ["invite", token] as const,
  pinnedCommunities: () => ["me", "pinned-communities"] as const,
  channelMembers: (communityId: string, channelId: string) =>
    ["channels", communityId, channelId, "members"] as const,
  user: (id: number) => ["users", id] as const,
  notifications: (communityIdentifier: string) => ["notifications", communityIdentifier] as const,
  dmNotifications: () => ["notifications", "dm"] as const,
  notificationUnreadCounts: () => ["notifications", "unread-counts"] as const,
  notificationPreferences: () => ["notificationPreferences"] as const,
  channelUnread: (communityIdentifier: string) => ["channelUnread", communityIdentifier] as const,
  serverInfo: () => ["serverInfo"] as const,
  stats: () => ["stats"] as const,
  channelParticipants: (communityId: string, channelId: string) =>
    ["channels", communityId, channelId, "participants"] as const,
  reactionUsers: (messageIri: string, emoji: string) =>
    ["reactionUsers", messageIri, emoji] as const,
  communityEmojis: (communityIdentifier: string) =>
    ["communities", communityIdentifier, "emojis"] as const,
  groups: (communityId: string) => ["communities", communityId, "groups"] as const,
  group: (communityId: string, groupId: string) =>
    ["communities", communityId, "groups", groupId] as const,
  myGroups: () => ["me", "groups"] as const,
  groupMembers: (communityId: string, groupId: string) =>
    ["communities", communityId, "groups", groupId, "members"] as const,
  groupChannelPermissions: (communityId: string, groupId: string) =>
    ["communities", communityId, "groups", groupId, "channel-permissions"] as const,
  moderationLog: (communityId: string) => ["communities", communityId, "moderation"] as const,
  activeModeration: (communityId: string, userId: number) =>
    ["communities", communityId, "users", userId, "active-moderation"] as const,
  moderatorNotes: (communityId: string, userId: number) =>
    ["communities", communityId, "users", userId, "notes"] as const,
  communityReports: (communityId: string, status: string) =>
    ["communities", communityId, "reports", status] as const,
  adminReports: (status: string) => ["admin", "reports", status] as const,
  communityAppeals: (communityId: string, status: string) =>
    ["communities", communityId, "appeals", status] as const,
  conversations: () => ["conversations"] as const,
  conversation: (identifier: string) => ["conversations", identifier] as const,
  conversationPages: (identifier: string) => ["conversations", identifier, "pages"] as const,
  conversationMessages: (identifier: string) => ["conversations", identifier, "messages"] as const,
  invitableUsers: (search: string) => ["users", "invitable", search] as const,
  userPresence: (userId: number) => ["presence", "user", userId] as const,
  communityPresenceSummary: (identifier: string) =>
    ["presence", "community", identifier, "summary"] as const,
  presenceHistory: (identifier: string, days: number) =>
    ["presence-history", identifier, days] as const,
  communityOnlineUsers: (identifier: string) =>
    ["presence", "community", identifier, "online"] as const,
  typing: (scope: string) => ["typing", scope] as const,
  apiKeys: () => ["me", "api-keys"] as const,
  adminBots: () => ["admin", "bots"] as const,
  adminServerConfig: () => ["admin", "server-config"] as const,
  adminUsers: (params: unknown) => ["admin", "users", "list", params] as const,
  adminUserDetail: (id: number) => ["admin", "users", id] as const,
  adminUserApiKeys: (id: number) => ["admin", "users", id, "api-keys"] as const,
  adminCommunities: (params: unknown) => ["admin", "communities", params] as const,
  adminHealth: () => ["admin", "health"] as const,
  adminSetupStatus: () => ["admin", "setup-status"] as const,
  adminAuditLog: (action: string, page: number) => ["admin", "audit-log", action, page] as const,
  adminAuditActions: () => ["admin", "audit-log", "actions"] as const,
  userPreferences: () => ["me", "preferences"] as const,
  accountDeletion: () => ["me", "account-deletion"] as const,
  twoFactor: () => ["me", "2fa"] as const,
  dataExport: () => ["me", "data-export"] as const,
  channelSearch: (communityId: string, channelIdentifier: string, q: string) =>
    ["search", "channel", communityId, channelIdentifier, q] as const,
  communitySearch: (communityId: string, q: string) =>
    ["search", "community", communityId, q] as const,
  conversationSearch: (conversationIdentifier: string, q: string) =>
    ["search", "conversation", conversationIdentifier, q] as const,
  adminWebhooks: () => ["admin", "webhooks"] as const,
  adminWebhookTriggers: () => ["admin", "webhooks", "triggers"] as const,
  adminWebhookDeliveries: (id: number, page: number) =>
    ["admin", "webhooks", id, "deliveries", page] as const,
  myMemberships: () => ["me", "community-memberships"] as const,
  communityMembership: (identifier: string) => ["communities", identifier, "membership"] as const,
};

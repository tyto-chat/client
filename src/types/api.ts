export interface HydraResource {
  "@id": string;
  "@type": string;
}

export interface HydraCollection<T> {
  "@context": string;
  "@id": string;
  "@type": string;
  "hydra:member": T[];
  "hydra:totalItems": number;
}

export interface User extends HydraResource {
  id: number;
  email: string;
  roles?: string[];
  isAdmin?: boolean;
  profile: UserProfile;
  emailNotifications?: boolean;
  onboardedAt?: string | null;
}

export interface AvatarMediaObject extends HydraResource {
  contentUrl: { sm: string; md: string; lg: string } | null;
}

export interface LogoMediaObject extends HydraResource {
  contentUrl: { sm: string; md: string; lg: string } | null;
}

export interface UserProfile extends HydraResource {
  name: string;
  avatar: AvatarMediaObject | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
}

export interface ChannelSection extends HydraResource {
  id: number;
  name: string;
  identifier: string;
  position: number;
}

export interface Channel extends HydraResource {
  id: number;
  name: string;
  identifier: string;
  position: number;
  description?: string;
  section: ChannelSection;
  lastMessageAt?: string | null;
  isPrivate?: boolean | null;
  isReadonly?: boolean | null;
  areReadonlyRepliesAllowed?: boolean | null;
  archivedAt?: string | null;
  allowAttachments?: boolean;
  type?: "text" | "audio";
}

export interface ChannelParticipant extends HydraResource {
  id: number;
  userId: number;
  profile: UserProfile;
  joinedAt: string;
}

export interface ChannelParticipantsMercureEvent {
  type: "channel.participants";
  channelId: number;
  participants: { userId: number; name: string; avatarUrl: string | null; joinedAt: string }[];
  generatedAt?: number;
}

export type CommunityLocale = "en" | "pl" | "fr" | "de" | "es" | "it";

export interface Community extends HydraResource {
  id: number;
  identifier: string;
  name: string;
  hostname: string;
  description: string;
  isPrivate: boolean | null;
  broadcastMentionMinRole: "member" | "moderator" | "admin";
  locale: string;
  welcomeChannel?: Channel | null;
  logo: LogoMediaObject | null;
  memberCount?: number | null;
  channels: Channel[];
  channelSections: ChannelSection[];
  accentColor: string | null;
}

export interface MyCommunityMembership {
  communityId: number;
  communityIdentifier: string;
  role: "member" | "moderator" | "admin";
}

/** `channelRoles` serializes as `[]` when empty and `{}` otherwise — never do a strict object/array runtime check on it. */
export interface CommunityMembership {
  role: "member" | "moderator" | "admin" | null;
  hasMembership: boolean;
  channelRoles: Record<number, "member" | "moderator">;
}

export interface CommunityMember extends HydraResource {
  id: number;
  role: "member" | "moderator" | "admin";
  joinedAt: string;
  userId: number;
  profile: UserProfile;
  groups: UserGroup[];
}

export interface UserGroup extends HydraResource {
  id: number;
  identifier: string;
  name: string;
  icon: string | null;
  color: string | null;
  isHidden: boolean;
  ownerId: number | null;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MyGroupSummary {
  identifier: string;
  name: string;
  icon: string | null;
  color: string | null;
  communityIdentifier: string;
  communityName: string;
  memberCount: number;
  isOwner: boolean;
}

export interface UserGroupMember extends HydraResource {
  id: number;
  userId: number;
  addedAt: string;
}

export interface GroupChannelPermission extends HydraResource {
  id: number;
  channelId: number;
  role: "member" | "moderator";
}

export interface ChannelMember extends HydraResource {
  id: number;
  userId: number;
  profile: UserProfile;
  addedAt: string;
  role: "member" | "moderator";
}

export interface MessageBodyRevision extends HydraResource {
  body: string;
  createdAt: string;
  createdBy?: User;
}

export interface ReactionEntry {
  id: number;
  userId: number;
}

export interface ReactionUser {
  profile: string;
  name: string;
}

export interface Attachment extends HydraResource {
  contentUrl: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
}

export interface CommunityEmojiImage extends HydraResource {
  contentUrl: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

export interface CommunityEmoji extends HydraResource {
  id: number;
  shortcode: string;
  name: string | null;
  image: CommunityEmojiImage | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageKind = "standard" | "system";

export interface Message extends HydraResource {
  id: string;
  text: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedBy?: User | null;
  edited: boolean;
  kind: MessageKind;
  createdAt: string;
  createdBy?: User;
  reactions: Record<string, ReactionEntry[]> | null;
  pageNumber: number | null;
  communityIdentifier?: string | null;
  channelIdentifier?: string | null;
  conversationIdentifier?: string | null;
  parent?: Message | null;
  attachments?: Attachment[];
  pinned?: boolean;
  pinnedAt?: string | null;
  pinnedBy?: User | null;
  replyCount?: number;
  lastReplyAt?: string | null;
  purgedAttachmentCount?: number;
}

export interface ChannelPage extends HydraResource {
  id: number;
  pageNumber: number;
  messageCount: number;
  prevPageId: number | null;
  nextPageId: number | null;
  messages?: Message[];
}

export interface ConversationMember extends HydraResource {
  id: number;
  userId: number;
  profile: UserProfile | null;
  joinedAt: string;
  mutedUntil: string | null;
  lastReadAt: string | null;
}

export interface Conversation extends HydraResource {
  id: number;
  identifier: string;
  members: ConversationMember[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface InvitableUser {
  id: number;
  name: string | null;
  avatarUrl: string | null;
}

export interface InvitableUsersResponse {
  items: InvitableUser[];
  total: number;
}

export interface CommunityInvite {
  "@id": string;
  "@type": "CommunityInvite";
  id: number;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  isValid: boolean;
  communityIdentifier: string;
}

export interface InvitePreview {
  communityIdentifier: string;
  communityName: string;
}

export interface PinnedCommunity {
  position: number;
  community: Community;
}

export interface PinnedCommunitiesResponse {
  items: PinnedCommunity[];
}

export interface ConversationActivityMercureEvent {
  type: "conversation.activity";
  conversationIdentifier: string;
  lastMessageAt: string | null;
}

export interface MessageUpdateEvent {
  type: "message.update";
  "@id": string;
  reactions?: Record<string, ReactionEntry[]> | null;
  isDeleted?: boolean;
  edited?: boolean;
  text?: string | null;
  attachments?: Attachment[];
  pinned?: boolean;
  pinnedAt?: string | null;
  replyCount?: number;
  lastReplyAt?: string | null;
}

export interface MessageAttachmentsUpdateEvent {
  type: "message.update";
  "@id": string;
  attachments: Attachment[];
}

export interface TypingMercureEvent {
  type: "typing";
  userId: number;
  name: string;
}

export interface AppNotification extends HydraResource {
  id: number;
  type:
    | "mention"
    | "broadcast_mention"
    | "channel_activity"
    | "channel_access"
    | "channel_moderator"
    | "group_added"
    | "group_removed"
    | "dm_message"
    | "report_filed"
    | "report_escalated"
    | "report_resolved"
    | "report_dismissed"
    | "warn"
    | "timeout"
    | "ban"
    | "server_ban"
    | "timeout_lifted"
    | "ban_lifted"
    | "server_ban_lifted"
    | "appeal_filed"
    | "appeal_upheld"
    | "appeal_overturned"
    | "group_ownership_transferred"
    | "webhook_failed"
    | "disk_pressure_purge";
  isRead: boolean;
  createdAt: string;
  authorName: string;
  channelIdentifier: string;
  communityIdentifier: string;
  conversationIdentifier?: string | null;
  messageIri?: string | null;
  groupName?: string | null;
  groupIdentifier?: string | null;
  reason?: string | null;
  moderationActionId?: number | null;
  actorIds?: number[] | null;
  messageCount?: number;
}

export type AppealStatus = "pending" | "upheld" | "overturned";

export interface Appeal extends HydraResource {
  id: number;
  moderationAction: ModerationAction;
  appellant: User;
  reason: string;
  status: AppealStatus;
  resolvedBy: User | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ChannelActivityMercureEvent {
  type: "channel.activity";
  channelIdentifier: string;
  lastMessageAt: string;
}

export interface UploadConstraints {
  avatarMaxSize: string;
  avatarMaxWidth: number;
  avatarMaxHeight: number;
  logoMaxSize: string;
  logoMaxWidth: number;
  logoMaxHeight: number;
  attachmentMaxSize: string;
  attachmentAllowedMimes: string;
  attachmentMaxPerMessage: number;
  communityEmojiMaxSize: string;
  communityEmojiMaxWidth: number;
  communityEmojiMaxHeight: number;
  communityEmojiAllowedMimes: string;
}

export interface PublicCommunityStats {
  memberCount: number;
  onlineCount: number;
  channelCount: number;
}

export interface ServerInfo {
  name: string;
  description: string;
  apiUrl: string;
  mercureUrl: string;
  liveKitUrl: string;
  voiceEnabled: boolean;
  webPushPublicKey: string;
  uploads: UploadConstraints | null;
  communities: Community[];
  communityStats?: Record<string, PublicCommunityStats>;
  registrationEnabled: boolean;
  hasTerms: boolean;
  hasPrivacy: boolean;
  requireLegalConsent: boolean;
  legalContactEmail: string | null;
  minimumAgeYears: number;
  archivedChannelRetentionDays: number;
  listInServerCatalogue: boolean;
  adminOnboardingComplete: boolean;
}

export type LegalDocumentType = "terms" | "privacy";

export interface LegalDocument {
  type: LegalDocumentType;
  content: string;
  customized: boolean;
}

export interface SystemInfo {
  cpuCount: number;
  cpuLoad1: number;
  cpuLoad5: number;
  cpuLoad15: number;
  memoryTotal: number;
  memoryUsed: number;
  memoryFree: number;
  diskTotal: number;
  diskFree: number;
  mediaSize: number;
}

export interface CommunityStats {
  id: number;
  identifier: string;
  name: string;
  channelCount: number;
  memberCount: number;
  messageCount: number;
  attachmentCount: number;
  attachmentsSize: number;
}

export interface Stats {
  system: SystemInfo;
  communities: CommunityStats[];
}

export interface ModerationAction extends HydraResource {
  id: number;
  communityIdentifier: string;
  channelIdentifier: string | null;
  targetUser: User;
  actorUser: User;
  type: "warn" | "timeout" | "ban" | "server_ban";
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  liftedAt: string | null;
  liftedBy: User | null;
  active: boolean;
}

export interface ModeratorNote extends HydraResource {
  id: number;
  communityIdentifier: string;
  targetUser: User;
  author: User;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportCategory = "illegal_content" | "harassment" | "spam" | "rule_violation" | "other";

export type ReportStatus = "open" | "escalated" | "resolved" | "dismissed";

export interface Report extends HydraResource {
  id: number;
  reporter: User | null;
  reportedUser: User;
  communityIdentifier: string | null;
  communityName: string | null;
  messageId: string | null;
  messageDeleted: boolean | null;
  messageTextSnapshot: string | null;
  category: ReportCategory;
  comment: string | null;
  status: ReportStatus;
  resolvedBy: User | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export type PresenceState = "online" | "away" | "dnd" | "offline";

export type ManualPresenceStatus = "away" | "dnd" | "invisible";

export interface PresenceSnapshot {
  userId: number;
  state: PresenceState;
}

export interface PresenceBatchResponse {
  presences: PresenceSnapshot[];
}

export interface PresenceMercureEvent {
  type: "presence";
  userId: number;
  state: PresenceState;
}

export interface NotificationMercureEvent {
  type: "notification" | "notification.update";
  id: number;
  notificationType:
    | "mention"
    | "broadcast_mention"
    | "channel_activity"
    | "channel_access"
    | "channel_moderator"
    | "group_added"
    | "group_removed"
    | "dm_message"
    | "report_filed"
    | "report_escalated"
    | "report_resolved"
    | "report_dismissed";
  isRead: boolean;
  communityId: number | null;
  communityIdentifier: string;
  channelIdentifier: string;
  conversationIdentifier: string | null;
  messageIri: string | null;
  authorName: string;
  groupName: string | null;
  groupIdentifier: string | null;
  actorIds: number[] | null;
  messageCount: number;
  createdAt: string;
  reason?: string | null;
}

export type ChannelNotificationLevel = "all" | "mentions" | "none";

export type ChannelPinState = "favorite" | "hidden";

export interface NotificationPreferenceChannel {
  channelId: number;
  level: ChannelNotificationLevel;
  pinState: ChannelPinState | null;
}

export interface NotificationPreferencesSnapshot {
  channels: NotificationPreferenceChannel[];
  mutedCommunityIds: number[];
}

export type ApiKeyScope =
  | "profile:read"
  | "profile:write"
  | "messages:read"
  | "messages:write"
  | "conversations:read"
  | "conversations:write"
  | "communities:read"
  | "communities:write"
  | "notifications:read"
  | "notifications:write"
  | "push:write"
  | "moderation:read"
  | "moderation:write"
  | "admin";

export interface ApiKey {
  "@id": string;
  "@type": "ApiKey";
  id: number;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface IssuedApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  plainToken: string;
  createdAt: string;
  expiresAt: string | null;
}

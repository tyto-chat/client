/**
 * Canonical registry of `data-testid` values shared between the app (set via
 * `data-testid=` or the `testId=` prop on ui components) and the E2E specs /
 * page objects. Reference these instead of raw string literals so a rename is a
 * refactor, not a grep — and typos fail at compile time.
 *
 * Dynamic ids (e.g. `voice-mode-${mode}`) are exposed as builder functions.
 */
export const testIds = {
  adminShell: "admin-shell",
  mobileNavToggle: "mobile-nav-toggle",
  mobileNavScrim: "mobile-nav-scrim",
  mobileActionMenuBtn: "mobile-action-menu-btn",
  mobileSearchOpenBtn: "mobile-search-open-btn",
  profileMenu: "profile-menu",
  profileMenuButton: "profile-menu-button",
  notificationBell: "notification-bell",
  notificationUnreadBadge: "notification-unread-badge",

  communityActionsBtn: "community-actions-btn",
  manageCommunity: "manage-community",
  sectionActionsBtn: "section-actions-btn",
  channelHeaderMenuBtn: "channel-header-menu-btn",
  channelMoreActionsBtn: "channel-more-actions-btn",
  channelFavoriteBtn: "channel-favorite-btn",
  channelHideBtn: "channel-hide-btn",
  channelNotifMenuBtn: "channel-notif-menu-btn",
  communityMuteToggle: "community-mute-toggle",
  communityOnlineBadge: "community-online-badge",
  communityOnlinePanel: "community-online-panel",
  sidebarFavoritesSection: "sidebar-favorites-section",
  sidebarHiddenSection: "sidebar-hidden-section",
  sidebarArchivedSection: "sidebar-archived-section",
  channelArchiveBtn: "channel-archive-btn",
  channelUnarchiveBtn: "channel-unarchive-btn",
  archivedNotice: "archived-notice",
  confirmDialogConfirm: "confirm-dialog-confirm",

  searchOpenBtn: "search-open-btn",
  searchDialog: "search-dialog",
  searchInput: "search-input",
  searchSubmitBtn: "search-submit-btn",
  searchResultRow: "search-result-row",

  pinnedOpenBtn: "pinned-open-btn",
  pinnedMessagesModal: "pinned-messages-modal",
  pinnedMessageRow: "pinned-message-row",
  pinnedModalUnpinBtn: "pinned-modal-unpin-btn",
  threadPanel: "thread-panel",
  threadRepliesFooter: "thread-replies-footer",
  messageScroll: "message-scroll",
  msgAuthorName: "msg-author-name",
  msgTouchActionsBtn: "msg-touch-actions-btn",
  msgActionsRow: "msg-actions-row",
  msgActionReply: "msg-action-reply",
  msgActionPin: "msg-action-pin",
  msgActionHistory: "msg-action-history",
  msgActionEdit: "msg-action-edit",
  msgActionDelete: "msg-action-delete",
  msgActionReact: "msg-action-react",
  msgActionCopyLink: "msg-action-copy-link",
  msgActionReport: "msg-action-report",
  msgDeleteConfirmBtn: "msg-delete-confirm-btn",
  msgEditSaveBtn: "msg-edit-save-btn",

  notifLevelAll: "notif-level-all",
  notifLevelMentions: "notif-level-mentions",
  notifLevelNone: "notif-level-none",

  adminPanelMenuEntry: "admin-panel-menu-entry",
  groupChannelPermissions: "group-channel-permissions",
  modTabActions: "mod-tab-actions",
  modTabNotes: "mod-tab-notes",
  twoFactorEnable: "two-factor-enable",
  twoFactorDisable: "two-factor-disable",
  twoFactorRegenerate: "two-factor-regenerate",
  twoFactorSecret: "two-factor-secret",
  twoFactorSetupNext: "two-factor-setup-next",
  twoFactorSetupCode: "two-factor-setup-code",
  twoFactorCodesSaved: "two-factor-codes-saved",
  recoveryCode: "recovery-code",
  twoFactorActionSubmit: "two-factor-action-submit",
  twoFactorCodeInput: "two-factor-code-input",
  adminDisableTwoFactor: "admin-disable-2fa",

  prefTabVoiceVideo: "pref-tab-voice-video",
  prefTabGeneral: "pref-tab-general",
  prefTabChat: "pref-tab-chat",
  prefTabAccount: "pref-tab-account",
  mentionOptionChannel: "mention-option-channel",
  mentionOptionHere: "mention-option-here",
  langPl: "lang-pl",

  modlogRowWarn: "modlog-row-warn",
  modlogRowBan: "modlog-row-ban",

  presenceDot: "presence-dot",
  statusCurrent: "status-current",
  avatar: "avatar",
  sortableRow: "sortable-row",
  dmMutedIndicator: "dm-muted-indicator",
  dmMuteToggle: "dm-mute-toggle",
  noteEditTextarea: "note-edit-textarea",
  modApply: "mod-apply",
} as const;

/** `voice-mode-${mode}` toggle in Preferences. */
export const voiceModeTestId = (mode: "ptt" | "open") => `voice-mode-${mode}`;

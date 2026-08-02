import type common from "@/locales/en/common.json";
import type auth from "@/locales/en/auth.json";
import type channel from "@/locales/en/channel.json";
import type community from "@/locales/en/community.json";
import type settings from "@/locales/en/settings.json";
import type notifications from "@/locales/en/notifications.json";
import type admin from "@/locales/en/admin.json";
import type conversation from "@/locales/en/conversation.json";
import type reports from "@/locales/en/reports.json";
import type appeals from "@/locales/en/appeals.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
      auth: typeof auth;
      channel: typeof channel;
      community: typeof community;
      settings: typeof settings;
      notifications: typeof notifications;
      admin: typeof admin;
      conversation: typeof conversation;
      reports: typeof reports;
      appeals: typeof appeals;
    };
  }
}

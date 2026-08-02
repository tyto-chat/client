import type { User } from "@/types/api";

/** Base URL for the backend used in all unit tests against MSW handlers. */
export const TEST_BASE_URL = "https://tyto-chat.ddev.site";

/** Canonical mock user shared across handlers and providers. */
export const mockUser: User = {
  "@id": "/api/users/1",
  "@type": "User",
  id: 1,
  email: "test@example.com",
  profile: {
    "@id": "/api/profiles/1",
    "@type": "UserProfile",
    name: "Test User",
    avatar: null,
  },
  roles: ["ROLE_USER"],
};

import { setupServer } from "msw/node";
import { authHandlers } from "./handlers/auth";
import { usersHandlers } from "./handlers/users";
import { communitiesHandlers } from "./handlers/communities";
import { communityEmojiHandlers } from "./handlers/communityEmojis";
import { messagesHandlers } from "./handlers/messages";
import { realtimeHandlers } from "./handlers/realtime";
import { serverInfoHandlers } from "./handlers/serverInfo";

export const server = setupServer(
  ...authHandlers,
  ...usersHandlers,
  ...communitiesHandlers,
  ...communityEmojiHandlers,
  ...messagesHandlers,
  ...realtimeHandlers,
  ...serverInfoHandlers,
);

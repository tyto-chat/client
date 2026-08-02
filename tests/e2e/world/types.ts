/**
 * Per-worker isolated "world" — the seeded resources + role JWTs a single
 * Playwright worker owns. Built by `seedWorld(suffix)` and exposed through the
 * worker-scoped `world` fixture in `worldFixtures.ts`.
 *
 * Every id below is a slug that round-trips through `GET /api/communities/...`
 * and the app URL `/{communityId}/{channelId}` (see Step-0 decision in
 * seedWorld.ts).
 */
export interface World {
  communityId: string; // community identifier slug
  textChannelId: string; // text channel identifier slug
  audioChannelId: string; // audio channel identifier slug
  adminJwt: string; // shared bootstrap global admin (ROLE_ADMIN)
  userJwt: string; // this worker's regular member
  userName: string;
  cadminJwt: string; // this worker's community admin (community-scoped)
  cadminName: string;
}

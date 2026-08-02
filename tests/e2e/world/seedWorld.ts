/**
 * seedWorld(suffix) — builds an isolated per-worker world on the shared test DB.
 *
 * Each worker calls this once (worker-scoped fixture) with a namespacing
 * `suffix` (e.g. "w0", "w1"). Every resource it creates is namespaced by that
 * suffix so workers never collide on the shared DB:
 *
 *   community  identifier = `e2e-${suffix}`
 *   text       identifier = `general-${suffix}`
 *   audio      identifier = `voice-${suffix}`
 *   regular    user        = `user-${suffix}@tyto.test`   / "User ${suffix}"
 *   community  admin        = `cadmin-${suffix}@tyto.test` / "Cadmin ${suffix}"
 *
 * ── Step-0 decision: deterministic ids via slug-form names ───────────────────
 * The backend derives a community / channel `identifier` from its `name` via
 * Gedmo `#[Slug(fields: ['name'])]` (stof_doctrine_extensions). The DTO does NOT
 * accept an explicit identifier, so we pick names that are ALREADY valid
 * slug-form (lowercase, alphanumerics + hyphens) — Gedmo's urlizer leaves such
 * strings unchanged, so the derived slug equals the name verbatim. Gedmo only
 * appends a numeric suffix on a name collision; per-worker suffixes keep names
 * globally unique (channel identifiers are globally unique — UNIQ on
 * `identifier` with no community scope), and the idempotency guard below means
 * we never create the same world twice. Hence `communityId === \`e2e-${suffix}\``
 * (etc.) holds and round-trips through `GET /api/communities/{communityId}` and
 * the app URL `/{communityId}/{channelId}`.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * Playwright reuses a worker (and its suffix) after a retry, so seedWorld may
 * run twice for the same suffix. If the community already exists we skip
 * creation and just (re)collect JWTs. registerUser / joinCommunity are already
 * idempotent; promoteToAdmin re-PATCHes role=admin (a no-op when already admin).
 */
import { E2E_API_URL, E2E_BASE_URL } from "../fixtures";
import { WorldBuilder } from "./builder";
import type { World } from "./types";

const ADMIN_EMAIL = "admin@tyto.test";
const PASSWORD = "e2e-password";

export async function seedWorld(suffix: string): Promise<World> {
  const communityId = `e2e-${suffix}`;
  const textChannelId = `general-${suffix}`;
  const audioChannelId = `voice-${suffix}`;
  const userEmail = `user-${suffix}@tyto.test`;
  const userName = `User ${suffix}`;
  const cadminEmail = `cadmin-${suffix}@tyto.test`;
  const cadminName = `Cadmin ${suffix}`;

  // ── Shared bootstrap global admin JWT (ROLE_ADMIN, acts on this world only) ──
  const anon = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
  await anon.init();
  let adminJwt: string;
  try {
    adminJwt = await anon.getJwt(ADMIN_EMAIL, PASSWORD);
  } finally {
    await anon.dispose();
  }

  const admin = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, adminJwt);
  await admin.init();
  try {
    // The shared bootstrap admin's display name is "Admin User" — some specs
    // (moderation, auth) click/assert the admin by that name. The deleted
    // base.setup.ts used to set this; restore it here (idempotent — every
    // worker writes the same value to the same shared account).
    await admin.setDisplayName("Admin User");

    const alreadySeeded = await admin.communityExists(communityId);

    if (!alreadySeeded) {
      const community = await admin.createCommunity(`e2e-${suffix}`);
      const communityIri = community["@id"] as string;

      const textSection = await admin.createSection(communityId, "Text Channels");
      await admin.createChannel(communityIri, textSection["@id"] as string, textChannelId, "text");

      const voiceSection = await admin.createSection(communityId, "Voice Channels");
      await admin.createChannel(
        communityIri,
        voiceSection["@id"] as string,
        audioChannelId,
        "audio",
      );

      // Creating a community no longer auto-enrolls the creator — admins join
      // like anyone. Join so the admin can act in this world's channels.
      await admin.joinCommunity(communityId);
    }

    const userJwt = await seedMember(userEmail, userName, communityId);

    // ── Community admin (community-scoped role, NOT ROLE_ADMIN) ────────────────
    const cadminJwt = await seedMember(cadminEmail, cadminName, communityId);
    await admin.promoteToAdmin(communityId, cadminName);

    return {
      communityId,
      textChannelId,
      audioChannelId,
      adminJwt,
      userJwt,
      userName,
      cadminJwt,
      cadminName,
    };
  } finally {
    await admin.dispose();
  }
}

/**
 * Register (idempotent) a member, complete onboarding, join the community, and
 * return their JWT. Registration/join tolerate re-runs against a non-reset DB.
 */
async function seedMember(
  email: string,
  displayName: string,
  communityId: string,
): Promise<string> {
  const anon = new WorldBuilder(E2E_API_URL, E2E_BASE_URL);
  await anon.init();
  let jwt: string;
  try {
    await anon.registerUser(email, PASSWORD, displayName);
    jwt = await anon.getJwt(email, PASSWORD);
  } finally {
    await anon.dispose();
  }

  const member = new WorldBuilder(E2E_API_URL, E2E_BASE_URL, jwt);
  await member.init();
  try {
    await member.completeOnboarding();
    await member.joinCommunity(communityId);
  } finally {
    await member.dispose();
  }

  return jwt;
}

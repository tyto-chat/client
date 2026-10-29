import { fromBase64, toBase64, type CommitSubmission } from "@/api/e2ee";

export interface RosterEntry {
  leafIndex: number;
  accountId: number;
  deviceId: string;
  generation: number;
}

export interface PendingStage {
  kind: "own" | "incoming" | "welcome";
  stageId: string;
  groupId: string;
  epoch: number;
  generation: number;
  submission?: CommitSubmission;
  welcomeId?: string;
  roster?: RosterEntry[];
  mlsEpoch?: number;
}

export interface FrozenMark {
  generation: number;
  at: number;
}

export interface GroupProgress {
  conversationId: number;
  groupId: string | null;
  generation: number;
  epoch: number;
  removed: boolean;
  frozen: FrozenMark[];
  roster: RosterEntry[];
  mlsEpoch: number | null;
  pending: PendingStage | null;
}

interface StoredSubmission extends Omit<CommitSubmission, "commit" | "groupInfo" | "welcomes"> {
  commit: string;
  groupInfo: string;
  welcomes: { deviceId: string; data: string }[];
}

interface StoredProgress extends Omit<GroupProgress, "pending"> {
  pending: (Omit<PendingStage, "submission"> & { submission?: StoredSubmission }) | null;
}

export function emptyProgress(conversationId: number): GroupProgress {
  return {
    conversationId,
    groupId: null,
    generation: 0,
    epoch: 0,
    removed: false,
    frozen: [],
    roster: [],
    mlsEpoch: null,
    pending: null,
  };
}

export function encodeProgress(progress: GroupProgress): Uint8Array {
  const { pending } = progress;
  const submission = pending?.submission;
  const stored: StoredProgress = {
    ...progress,
    pending:
      pending === null
        ? null
        : {
            ...pending,
            submission:
              submission === undefined
                ? undefined
                : {
                    ...submission,
                    commit: toBase64(submission.commit),
                    groupInfo: toBase64(submission.groupInfo),
                    welcomes: submission.welcomes.map((w) => ({
                      deviceId: w.deviceId,
                      data: toBase64(w.data),
                    })),
                  },
          },
  };
  return new TextEncoder().encode(JSON.stringify(stored));
}

export function decodeProgress(data: Uint8Array): GroupProgress {
  const stored = JSON.parse(new TextDecoder().decode(data)) as StoredProgress;
  const submission = stored.pending?.submission;
  return {
    ...stored,
    roster: stored.roster ?? [],
    mlsEpoch: stored.mlsEpoch ?? null,
    pending:
      stored.pending === null
        ? null
        : {
            ...stored.pending,
            submission:
              submission === undefined
                ? undefined
                : {
                    ...submission,
                    commit: fromBase64(submission.commit),
                    groupInfo: fromBase64(submission.groupInfo),
                    welcomes: submission.welcomes.map((w) => ({
                      deviceId: w.deviceId,
                      data: fromBase64(w.data),
                    })),
                  },
          },
  };
}

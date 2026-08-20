import { getUserColor } from "@/utils/userColor";

export function IdentityAvatar({
  displayName,
  email,
  avatarDataUrl,
  avatarColorKey,
  sizeClassName = "h-11 w-11",
  imageTestId,
  initialTestId,
}: {
  displayName?: string | null;
  email: string;
  avatarDataUrl?: string | null;
  avatarColorKey?: string | null;
  sizeClassName?: string;
  imageTestId?: string;
  initialTestId?: string;
}) {
  const primary = displayName?.trim() || email;
  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt=""
        data-testid={imageTestId}
        className={`${sizeClassName} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      data-testid={initialTestId}
      style={{ backgroundColor: getUserColor(avatarColorKey ?? email) }}
      className={`${sizeClassName} grid shrink-0 place-items-center rounded-full text-[17px] font-bold text-white`}
    >
      {primary.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

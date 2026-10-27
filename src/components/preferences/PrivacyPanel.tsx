import { BlockedUsersSection } from "@/components/preferences/BlockedUsersSection";

export function PrivacyPanel() {
  return (
    <div className="flex flex-col gap-6">
      <BlockedUsersSection />
    </div>
  );
}

import { SecurityTab } from "@/components/SecurityTab";
import { AccountTab } from "@/components/AccountTab";
import { PlainDmRefusalSection } from "@/components/preferences/PlainDmRefusalSection";

export function AccountSecurityPanel() {
  return (
    <div className="flex flex-col gap-6">
      <SecurityTab />
      <hr className="border-line" />
      <PlainDmRefusalSection />
      <AccountTab />
    </div>
  );
}

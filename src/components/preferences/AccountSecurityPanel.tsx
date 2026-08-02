import { SecurityTab } from "@/components/SecurityTab";
import { AccountTab } from "@/components/AccountTab";

export function AccountSecurityPanel() {
  return (
    <div className="flex flex-col gap-6">
      <SecurityTab />
      <hr className="border-line" />
      <AccountTab />
    </div>
  );
}

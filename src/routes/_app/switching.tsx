import { createFileRoute } from "@tanstack/react-router";
import { SwitchingScreen } from "@/components/SwitchingScreen";

export const Route = createFileRoute("/_app/switching")({
  component: SwitchingScreen,
});

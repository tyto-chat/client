import { useEffect, useState } from "react";
import { getBaseUrl } from "@/api/client";
import { observeApiTransport, type ApiTransport } from "@/utils/apiTransport";

interface Detected {
  origin: string;
  transport: ApiTransport;
}

export function useApiTransport(): ApiTransport {
  const [detected, setDetected] = useState<Detected | null>(null);
  const apiOrigin = getBaseUrl();

  useEffect(
    () =>
      observeApiTransport(apiOrigin, (transport) => setDetected({ origin: apiOrigin, transport })),
    [apiOrigin],
  );

  return detected?.origin === apiOrigin ? detected.transport : "unknown";
}

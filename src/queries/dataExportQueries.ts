import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDataExportStatus, requestDataExport, type DataExportRequest } from "@/api/dataExport";
import { queryKeys } from "@/queries/queryKeys";

export function useDataExportStatus(enabled = true) {
  return useQuery<DataExportRequest>({
    queryKey: queryKeys.dataExport(),
    queryFn: fetchDataExportStatus,
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return "queued" === status || "processing" === status ? 5_000 : false;
    },
  });
}

export function useRequestDataExport() {
  const qc = useQueryClient();
  return useMutation<DataExportRequest, Error>({
    mutationFn: requestDataExport,
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.dataExport(), data);
    },
  });
}

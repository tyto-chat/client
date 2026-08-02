export function ErrorMessage({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-red-500 dark:text-red-400">{message}</p>;
}

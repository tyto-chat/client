import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  url: string;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: Props) {
  const { t } = useTranslation("channel");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <img
        src={url}
        alt={t("image")}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-soft-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

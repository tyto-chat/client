import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Modal } from "@/components/Modal";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useSetupTwoFactor, useConfirmTwoFactor } from "@/queries/twoFactorQueries";
import { downloadTextFile } from "@/utils/downloadTextFile";
import { apiErrorText } from "@/api/client";

export function RecoveryCodesDisplay({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation("settings");
  const [copied, setCopied] = useState(false);

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
        {t("two_factor_codes_warning")}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-3 font-mono text-sm text-fg">
        {codes.map((rc) => (
          <span key={rc} data-testid="recovery-code" className="select-all">
            {rc}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copyCodes()}
          className="flex-1 rounded-lg bg-canvas px-3 py-2 text-sm font-medium ring-1 ring-inset ring-line hover:bg-surface"
        >
          {copied ? t("two_factor_codes_copied") : t("two_factor_codes_copy")}
        </button>
        <button
          type="button"
          onClick={() => downloadTextFile("recovery-codes.txt", codes.join("\n"))}
          className="flex-1 rounded-lg bg-canvas px-3 py-2 text-sm font-medium ring-1 ring-inset ring-line hover:bg-surface"
        >
          {t("two_factor_codes_download")}
        </button>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90"
        data-testid="two-factor-codes-saved"
      >
        {t("two_factor_codes_saved")}
      </button>
    </div>
  );
}

export function TwoFactorSetupModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("settings");
  const [step, setStep] = useState<"qr" | "verify" | "codes">("qr");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setup = useSetupTwoFactor();
  const confirm = useConfirmTwoFactor();

  useEffect(() => {
    if (setup.data?.otpauthUri && canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, setup.data.otpauthUri, { width: 192, margin: 1 });
    }
  }, [setup.data, step]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await confirm.mutateAsync(code);
      setRecoveryCodes(result.recoveryCodes);
      setStep("codes");
    } catch (err) {
      setError(apiErrorText(err, t("two_factor_confirm_failed")));
    }
  }

  return (
    <Modal
      title={t("two_factor_setup_title")}
      onClose={onClose}
      dismissable={step !== "codes"}
      size="md"
    >
      {(close) => (
        <>
          {step === "qr" && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-fg-muted">{t("two_factor_scan_qr")}</p>
              {setup.isError ? (
                <ErrorMessage message={apiErrorText(setup.error, t("two_factor_setup_failed"))} />
              ) : (
                <canvas ref={canvasRef} className="rounded-lg bg-white p-2" />
              )}
              {setup.data && (
                <p className="text-xs text-fg-muted">
                  {t("two_factor_manual_secret")}{" "}
                  <code
                    data-testid="two-factor-secret"
                    className="select-all break-all rounded bg-surface px-1.5 py-0.5 font-mono"
                  >
                    {setup.data.secret}
                  </code>
                </p>
              )}
              <button
                type="button"
                disabled={!setup.data}
                onClick={() => setStep("verify")}
                className="w-full rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
                data-testid="two-factor-setup-next"
              >
                {t("two_factor_setup_next")}
              </button>
            </div>
          )}
          {step === "verify" && (
            <form onSubmit={handleConfirm} className="flex flex-col gap-4">
              <p className="text-sm text-fg-muted">{t("two_factor_verify_hint")}</p>
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-full rounded-lg bg-surface px-3 py-2 text-center font-mono text-lg tracking-widest text-fg ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-[var(--accent)]"
                data-testid="two-factor-setup-code"
              />
              <ErrorMessage message={error} />
              <button
                type="submit"
                disabled={code.length !== 6 || confirm.isPending}
                className="w-full rounded-lg bg-accent-gradient px-4 py-2 text-sm font-semibold text-on-accent shadow-soft-sm transition hover:opacity-90 disabled:opacity-40"
              >
                {t("two_factor_setup_confirm")}
              </button>
            </form>
          )}
          {step === "codes" && recoveryCodes && (
            <RecoveryCodesDisplay codes={recoveryCodes} onDone={close} />
          )}
        </>
      )}
    </Modal>
  );
}

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../mocks/server";
import { NotificationProvider } from "@/context/NotificationContext";
import { AddIdentityWizard } from "@/desktop/AddIdentityWizard";

const ORIGIN = "https://srv.example";
const ORIGIN_2 = "https://srv2.example";

function stubServerResolution(serverInfo: Record<string, unknown> = {}) {
  server.use(
    http.get(`${ORIGIN}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN}/api`, name: "Srv", ...serverInfo }),
    ),
  );
}

function stubSecondServerResolution() {
  server.use(
    http.get(`${ORIGIN_2}/api/versions`, () => HttpResponse.json({ versions: ["v1"] })),
    http.get(`${ORIGIN_2}/api/v1/server-info`, () =>
      HttpResponse.json({ apiUrl: `${ORIGIN_2}/api`, name: "Srv2" }),
    ),
  );
}

describe("AddIdentityWizard", () => {
  it("walks server → credentials → complete without 2FA", async () => {
    stubServerResolution();
    server.use(
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-a", refresh_token: "refresh-a" }),
      ),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={onComplete} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          serverUrl: ORIGIN,
          email: "a@b.c",
          password: "pw",
          token: "jwt-a",
          refreshToken: "refresh-a",
        }),
      ),
    );
  });

  it("shows the totp step when 2FA is required and completes after verify", async () => {
    stubServerResolution();
    server.use(
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "pending", twoFactorRequired: true }),
      ),
      http.post(`${ORIGIN}/api/auth/2fa`, () =>
        HttpResponse.json({ token: "jwt-b", refresh_token: "refresh-b" }),
      ),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={onComplete} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));
    await user.type(await screen.findByTestId("wizard-totp-input"), "123456");

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ token: "jwt-b", refreshToken: "refresh-b" }),
      ),
    );
  });

  it("shows an error on unreachable server and stays on the server step", async () => {
    server.use(http.get(`${ORIGIN}/api/versions`, () => HttpResponse.error()));
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={vi.fn()} />);
    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    expect(await screen.findByText(/could not reach|unreachable/i)).toBeInTheDocument();
    expect(screen.getByTestId("wizard-server-input")).toBeInTheDocument();
  });

  it("skips the server step when locked for re-login", async () => {
    stubServerResolution();
    server.use(
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-c", refresh_token: "refresh-c" }),
      ),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <AddIdentityWizard
        onComplete={onComplete}
        initialServerUrl={ORIGIN}
        initialEmail="a@b.c"
        lockServer
      />,
    );
    expect(await screen.findByTestId("wizard-password-input")).toBeInTheDocument();
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("surfaces server_unreachable, not invalid_credentials, when locked resolution fails after an early credentials submit", async () => {
    server.use(
      http.get(`${ORIGIN}/api/versions`, async () => {
        await delay(50);
        return HttpResponse.error();
      }),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <AddIdentityWizard
        onComplete={onComplete}
        initialServerUrl={ORIGIN}
        initialEmail="a@b.c"
        lockServer
      />,
    );

    const passwordInput = await screen.findByTestId("wizard-password-input");
    await user.type(passwordInput, "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    expect(await screen.findByText(/could not reach|unreachable/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("wizard-server-input")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows the resolved server origin on the credentials step", async () => {
    stubServerResolution();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={vi.fn()} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));

    expect(await screen.findByTestId("wizard-server-origin")).toHaveTextContent(ORIGIN);
    expect(screen.getByTestId("wizard-server-chip-initial")).toHaveTextContent("S");
  });

  it("returns to the server step via change-server and re-resolves against a new origin", async () => {
    stubServerResolution();
    stubSecondServerResolution();
    server.use(
      http.post(`${ORIGIN_2}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-d", refresh_token: "refresh-d" }),
      ),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={onComplete} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");

    await user.click(screen.getByTestId("wizard-change-server"));

    const serverInput = await screen.findByTestId("wizard-server-input");
    expect(serverInput).toHaveValue("srv.example");

    await user.clear(serverInput);
    await user.type(serverInput, "srv2.example");
    await user.click(screen.getByTestId("wizard-server-submit"));

    expect(await screen.findByTestId("wizard-server-origin")).toHaveTextContent(ORIGIN_2);
    expect(screen.getByTestId("wizard-email-input")).toHaveValue("a@b.c");

    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ serverUrl: ORIGIN_2, token: "jwt-d" }),
      ),
    );
  });

  it("shows change-server on a locked wizard and unlocks the server step", async () => {
    stubServerResolution();
    const user = userEvent.setup();
    render(
      <AddIdentityWizard
        onComplete={vi.fn()}
        initialServerUrl={ORIGIN}
        initialEmail="a@b.c"
        lockServer
      />,
    );

    expect(await screen.findByTestId("wizard-password-input")).toBeInTheDocument();
    const changeServer = screen.getByTestId("wizard-change-server");
    expect(changeServer).toBeInTheDocument();

    await user.click(changeServer);

    const serverInput = await screen.findByTestId("wizard-server-input");
    expect(serverInput).toHaveValue(ORIGIN);
    expect(serverInput).not.toHaveAttribute("readonly");
    expect(serverInput).not.toBeDisabled();
  });

  it("disables change-server while a login is in flight, then still completes it", async () => {
    stubServerResolution();
    server.use(
      http.post(`${ORIGIN}/api/auth`, async () => {
        await delay(50);
        return HttpResponse.json({ token: "jwt-e", refresh_token: "refresh-e" });
      }),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={onComplete} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    const changeServer = screen.getByTestId("wizard-change-server");
    await waitFor(() => expect(changeServer).toBeDisabled());
    await user.click(changeServer);
    expect(screen.getByTestId("wizard-email-input")).toBeInTheDocument();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ token: "jwt-e", refreshToken: "refresh-e" }),
      ),
    );
  });

  it("renders six totp cells and reflects typed digits", async () => {
    stubServerResolution();
    server.use(
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "pending", twoFactorRequired: true }),
      ),
    );
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={vi.fn()} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.type(screen.getByTestId("wizard-password-input"), "pw");
    await user.click(screen.getByTestId("wizard-credentials-submit"));

    const totpInput = await screen.findByTestId("wizard-totp-input");
    expect(screen.getByTestId("wizard-server-chip-initial")).toHaveTextContent("S");
    const cells = Array.from({ length: 6 }, (_, i) => screen.getByTestId(`wizard-totp-cell-${i}`));
    expect(cells).toHaveLength(6);
    cells.forEach((cell) => expect(cell).toHaveTextContent(""));

    await user.type(totpInput, "471");

    expect(cells[0]).toHaveTextContent("4");
    expect(cells[1]).toHaveTextContent("7");
    expect(cells[2]).toHaveTextContent("1");
    expect(cells[3]).toHaveTextContent("");
    expect(cells[4]).toHaveTextContent("");
    expect(cells[5]).toHaveTextContent("");
  });

  it("hides the register link when registration is disabled", async () => {
    stubServerResolution();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={vi.fn()} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));

    expect(await screen.findByTestId("wizard-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-forgot-password")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-register-link")).not.toBeInTheDocument();
  });

  it("registers a new account and completes the wizard when registration is enabled", async () => {
    stubServerResolution({ registrationEnabled: true });
    server.use(
      http.post(`${ORIGIN}/api/api/v1/challenges`, () => HttpResponse.json({}, { status: 201 })),
      http.post(`${ORIGIN}/api/api/v1/users`, () => HttpResponse.json({ id: 1 }, { status: 201 })),
      http.post(`${ORIGIN}/api/auth`, () =>
        HttpResponse.json({ token: "jwt-r", refresh_token: "refresh-r" }),
      ),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<AddIdentityWizard onComplete={onComplete} />);

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.click(await screen.findByTestId("wizard-register-link"));

    await user.type(await screen.findByTestId("register-email-input"), "new@b.c");
    await user.click(screen.getByTestId("register-email-submit"));

    await user.type(await screen.findByTestId("register-display-name-input"), "Newbie");
    await user.click(screen.getByLabelText("Digit 1"));
    await user.paste("123456");
    await user.type(screen.getByTestId("register-password-input"), "longenough");
    await user.type(screen.getByTestId("register-confirm-password-input"), "longenough");
    await user.click(screen.getByTestId("register-submit"));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          serverUrl: ORIGIN,
          email: "new@b.c",
          password: "longenough",
          token: "jwt-r",
          refreshToken: "refresh-r",
        }),
      ),
    );
  });

  it("opens the forgot-password modal and requests a reset against the resolved server", async () => {
    stubServerResolution();
    const resetRequests: unknown[] = [];
    server.use(
      http.post(`${ORIGIN}/api/api/v1/reset_password`, async ({ request }) => {
        resetRequests.push(await request.json());
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    render(
      <NotificationProvider>
        <AddIdentityWizard onComplete={vi.fn()} />
      </NotificationProvider>,
    );

    await user.type(screen.getByTestId("wizard-server-input"), "srv.example");
    await user.click(screen.getByTestId("wizard-server-submit"));
    await user.type(await screen.findByTestId("wizard-email-input"), "a@b.c");
    await user.click(screen.getByTestId("wizard-forgot-password"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/email/i)).toHaveValue("a@b.c");
    await user.click(within(dialog).getByRole("button", { name: /send/i }));

    await waitFor(() => expect(resetRequests).toEqual([{ email: "a@b.c" }]));
  });

  it("shows the welcome-back identity block with the signed-in email on a locked wizard", async () => {
    stubServerResolution();
    render(
      <AddIdentityWizard
        onComplete={vi.fn()}
        initialServerUrl={ORIGIN}
        initialEmail="a@b.c"
        lockServer
      />,
    );

    expect(await screen.findByTestId("wizard-password-input")).toBeInTheDocument();
    expect(screen.getByText("a@b.c")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-email-input")).toHaveValue("a@b.c");
    expect(screen.queryByTestId("wizard-server-input")).not.toBeInTheDocument();
  });
});

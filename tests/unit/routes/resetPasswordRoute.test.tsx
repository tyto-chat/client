import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { configureApiClient } from "@/api/client";
import { TEST_BASE_URL as BASE } from "../../fixtures";
import { Route as ResetPasswordRoute } from "@/routes/reset-password";

let confirmBodies: unknown[];

beforeEach(() => {
  confirmBodies = [];
  configureApiClient(BASE);
  server.use(
    http.post(`${BASE}/api/v1/password`, async ({ request }) => {
      confirmBodies.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

function renderAt(url: string) {
  const rootRoute = createRootRoute();
  const resetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reset-password",
    validateSearch: ResetPasswordRoute.options.validateSearch,
    component: ResetPasswordRoute.options.component,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([resetRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
}

describe("reset password page", () => {
  it("starts on the request step by default", async () => {
    renderAt("/reset-password");

    expect(await screen.findByRole("button", { name: /send/i })).toBeInTheDocument();
    expect(document.querySelector("#token")).toBeNull();
  });

  it("opens on the code step when the email link asks for it", async () => {
    renderAt("/reset-password?step=confirm");

    await waitFor(() => expect(document.querySelector("#token")).not.toBeNull());
    expect(document.querySelector("#email")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  it("submits the email typed on the code step", async () => {
    renderAt("/reset-password?step=confirm");
    const user = userEvent.setup();

    await waitFor(() => expect(document.querySelector("#token")).not.toBeNull());
    await user.type(document.querySelector("#email")!, "a@b.c");
    await user.type(document.querySelector("#token")!, "123456");
    await user.type(document.querySelector("#password")!, "longenough");
    await user.type(document.querySelector("#confirmPassword")!, "longenough");
    await user.click(screen.getByRole("button", { name: /reset/i }));

    await waitFor(() =>
      expect(confirmBodies).toEqual([{ email: "a@b.c", token: "123456", password: "longenough" }]),
    );
  });

  it("ignores an unknown step value", async () => {
    renderAt("/reset-password?step=bogus");

    expect(await screen.findByRole("button", { name: /send/i })).toBeInTheDocument();
  });
});

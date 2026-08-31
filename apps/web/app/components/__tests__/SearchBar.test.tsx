import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SearchBar } from "../SearchBar.js";

function mockFetch(suggestions: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions }) }));
}

beforeEach(() => {
  push.mockClear();
  mockFetch([]); // default: no suggestions
});

describe("SearchBar", () => {
  it("routes a numeric query to the block page on submit", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "128940{enter}");
    expect(push).toHaveBeenCalledWith("/block/128940");
  });

  it("shows a message for unrecognized input", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "???{enter}");
    expect(screen.getByText(/unrecognized/i)).toBeInTheDocument();
  });

  it("shows a suggestion and navigates on click", async () => {
    mockFetch([{ kind: "block", label: "Block #5", href: "/block/5", found: true }]);
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "5");
    const opt = await screen.findByRole("option");
    expect(opt).toHaveTextContent("Block #5");
    await userEvent.click(opt);
    expect(push).toHaveBeenCalledWith("/block/5");
  });

  it("navigates to the highlighted suggestion via keyboard", async () => {
    mockFetch([{ kind: "tx", label: "Transaction g1a2…b3", href: "/transaction/g1a2b3", found: true }]);
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("combobox"), "g1a2b3");
    await screen.findByRole("option");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/transaction/g1a2b3");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SearchBar } from "../SearchBar.js";

describe("SearchBar", () => {
  it("routes a numeric query to the block page", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "128940{enter}");
    expect(push).toHaveBeenCalledWith("/block/128940");
  });
  it("shows a message for unrecognized input", async () => {
    render(<SearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "???{enter}");
    expect(screen.getByText(/unrecognized/i)).toBeInTheDocument();
  });
});

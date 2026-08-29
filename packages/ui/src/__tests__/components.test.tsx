import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button, Stat, Pill, Table, THead, TR, TH, TBody, TD, Section, Card } from "../index.js";

describe("components", () => {
  it("Button with internal href renders an anchor to that href", () => {
    render(<Button href="/blocks">Blocks</Button>);
    const link = screen.getByRole("link", { name: "Blocks" });
    expect(link).toHaveAttribute("href", "/blocks");
  });
  it("Button without href renders a button element", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
  it("Stat shows label, value, and unit", () => {
    render(<Stat label="Circulating" value="90.1M" unit="LNGX" />);
    expect(screen.getByText("Circulating")).toBeInTheDocument();
    expect(screen.getByText("90.1M")).toBeInTheDocument();
    expect(screen.getByText("LNGX")).toBeInTheDocument();
  });
  it("Pill token tone uses accent styling", () => {
    render(<Pill tone="token">token</Pill>);
    expect(screen.getByText("token").className).toContain("text-accent");
  });
  it("Table renders rows and cells inside a scroll wrapper", () => {
    render(
      <Table>
        <THead><TR><TH>H</TH></TR></THead>
        <TBody><TR><TD>cell</TD></TR></TBody>
      </Table>,
    );
    expect(screen.getByText("cell")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "H" })).toBeInTheDocument();
  });
  it("Section renders eyebrow + heading", () => {
    render(<Section eyebrow="Overview" title="Latest" level={2}>body</Section>);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Latest" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
  it("Card with rail renders the aurora rail element", () => {
    const { container } = render(<Card rail>x</Card>);
    expect(container.querySelector("[data-rail]")).not.toBeNull();
  });
});

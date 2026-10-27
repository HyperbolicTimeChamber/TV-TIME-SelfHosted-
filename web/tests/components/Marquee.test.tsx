import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Marquee from "../../src/components/Marquee";

const renderRow = (n: number) =>
	render(
		<Marquee
			items={Array.from({ length: n }, (_, i) => i)}
			getKey={(i) => i}
			renderItem={(i, hidden) => <button tabIndex={hidden ? -1 : undefined}>{`item ${i}`}</button>}
		/>,
	);

describe("Marquee", () => {
	it("6 or fewer items: plain row, no duplicates", () => {
		renderRow(6);
		expect(screen.getAllByRole("button")).toHaveLength(6);
	});

	it("more than 6: looping copy, hidden from screen readers and tab order", () => {
		const { container } = renderRow(7);
		// Accessible tree only sees one copy
		expect(screen.getAllByRole("button")).toHaveLength(7);
		const hiddenCopy = container.querySelector('[aria-hidden="true"]')!;
		expect(hiddenCopy.querySelectorAll("button")).toHaveLength(7);
		expect(hiddenCopy.hasAttribute("inert")).toBe(true);
	});
});

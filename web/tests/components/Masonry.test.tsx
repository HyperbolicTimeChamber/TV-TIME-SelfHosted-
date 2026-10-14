import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Masonry from "../../src/components/Masonry";

describe("Masonry", () => {
	it("fills columns left to right so rows keep reading order", () => {
		const { container } = render(
			<Masonry items={["a", "b", "c", "d", "e"]} columns={3} getKey={(x) => x} renderItem={(x) => <span>{x}</span>} />,
		);
		const cols = [...container.firstElementChild!.children].map((c) => c.textContent);
		expect(cols).toEqual(["ad", "be", "c"]);
	});

	it("one column keeps the plain list order", () => {
		const { container } = render(
			<Masonry items={["a", "b", "c"]} columns={1} getKey={(x) => x} renderItem={(x) => <span>{x}</span>} />,
		);
		expect(container.firstElementChild!.children).toHaveLength(1);
		expect(container.textContent).toBe("abc");
	});
});

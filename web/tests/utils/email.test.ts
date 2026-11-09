import { describe, expect, it } from "vitest";
import { isValidEmail } from "@app/utils/email";

describe("isValidEmail", () => {
	it("accepts a normal address", () => {
		expect(isValidEmail("jane.doe@example.com")).toBe(true);
	});

	it("accepts a plus tag", () => {
		expect(isValidEmail("jane+tv@mail.example.co.uk")).toBe(true);
	});

	it("rejects an emoji in the local part", () => {
		expect(isValidEmail("ja😀ne@example.com")).toBe(false);
	});

	it("rejects an emoji in the domain", () => {
		expect(isValidEmail("jane@exa😀mple.com")).toBe(false);
	});

	it("rejects a missing @", () => {
		expect(isValidEmail("jane.example.com")).toBe(false);
	});

	it("rejects a missing TLD", () => {
		expect(isValidEmail("jane@example")).toBe(false);
		expect(isValidEmail("jane@example.")).toBe(false);
	});

	it("rejects spaces", () => {
		expect(isValidEmail("jane doe@example.com")).toBe(false);
		expect(isValidEmail("jane@exa mple.com")).toBe(false);
	});
});

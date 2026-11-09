import { test } from "node:test";
import assert from "node:assert/strict";
import { carryLinks, withImdbId } from "../src/hooks/titleExtras/subjectLinks";
import { TmdbStudioType } from "../src/shared/enums";

const person = (id: number, imdbId?: string | null) => ({
  id,
  name: `P${id}`,
  character: null,
  profile: null,
  ...(imdbId !== undefined ? { imdbId } : {}),
});

test("withImdbId sets only that person", () => {
  assert.deepEqual(withImdbId([person(1), person(2)], 2, "nm2"), [person(1), person(2, "nm2")]);
  assert.equal(withImdbId(undefined, 2, "nm2"), undefined);
});

test("carryLinks keeps looked-up links, including a null 'TMDB has none'", () => {
  const { fields, fullCast } = carryLinks(
    { cast: [person(1, "nm1"), person(2, null)] },
    { cast: [person(1), person(2), person(3)] },
    [person(1), person(9)],
  );
  assert.deepEqual(fields.cast, [person(1, "nm1"), person(2, null), person(3)]);
  assert.deepEqual(fullCast, [person(1, "nm1"), person(9)]);
});

test("carryLinks keeps a looked-up studio, leaves a new one to be looked up", () => {
  const known = { id: 1, name: "A", logo: "/a.png" };
  const { fields } = carryLinks(
    {
      studioLogos: [
        { ...known, studioType: TmdbStudioType.NETWORK, homepage: "https://a.example" },
      ],
    },
    { studioLogos: [known, { id: 2, name: "B", logo: "/b.png" }] },
  );
  assert.deepEqual(fields.studioLogos, [
    { ...known, studioType: TmdbStudioType.NETWORK, homepage: "https://a.example" },
    { id: 2, name: "B", logo: "/b.png" },
  ]);
});

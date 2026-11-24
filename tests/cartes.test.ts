import { describe, expect, test } from "bun:test";
import { join } from "node:path";

process.env.OBS_CONTOURS = join(import.meta.dir, "fixtures", "contours");
const { contourCommune, contourDepartement, contoursDepartements, communesDuDepartement } = await import("../site/src/lib/contours.ts");

describe("contours", () => {
  test("un département connu a un contour, un département inconnu non", () => {
    expect(contourDepartement("44")).not.toBeNull();
    expect(contourDepartement("2A")?.properties?.code).toBe("2A");
    expect(contourDepartement("99")).toBeNull();
  });

  test("les départements peuvent être filtrés par code", () => {
    expect(contoursDepartements().features).toHaveLength(2);
    expect(contoursDepartements(["2A"]).features.map((f) => f.properties?.code)).toEqual(["2A"]);
  });

  test("les communes d'un département", () => {
    const c = communesDuDepartement("44");
    expect(c.features).toHaveLength(2);
    expect(c.features.every((f) => f.properties?.dep === "44")).toBe(true);
    expect(communesDuDepartement("2A").features).toHaveLength(0);
  });

  test("une commune sans contour est null", () => {
    expect(contourCommune("44109")).not.toBeNull();
    expect(contourCommune("75056")).toBeNull();
  });
});

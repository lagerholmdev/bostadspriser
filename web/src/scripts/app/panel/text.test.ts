import { describe, expect, it } from "vitest";
import { getArea } from "../../../lib/data";
import { changeSentence } from "./text";

describe("changeSentence", () => {
  it("knyter ihop ett år och tre månader med rätt bindeord", () => {
    const h = getArea("hagersten-liljeholmen")!.apartment!;
    expect(changeSentence(h.m12.change, h.m3.change)).toBe(
      "Priserna har gått upp 6,6 % på ett år, men ner 1,1 % de senaste tre månaderna.",
    );
    expect(changeSentence(10.5, 2)).toBe("Priserna har gått upp 10,5 % på ett år och 2,0 % de senaste tre månaderna.");
    expect(changeSentence(-6, -4.9)).toBe("Priserna har gått ner 6,0 % på ett år och 4,9 % de senaste tre månaderna.");
    expect(changeSentence(-0.9, 3.7)).toBe("Priserna har gått ner 0,9 % på ett år, men upp 3,7 % de senaste tre månaderna.");
  });
  it("säger oförändrat när värdet avrundas till noll", () => {
    expect(changeSentence(0.04, 1.2)).toBe(
      "Priserna är i stort sett oförändrade på ett år, men har gått upp 1,2 % de senaste tre månaderna.",
    );
    expect(changeSentence(2.1, 0)).toBe("Priserna har gått upp 2,1 % på ett år, men är i stort sett oförändrade de senaste tre månaderna.");
    expect(changeSentence(0, -0.01)).toBe("Priserna är i stort sett oförändrade både på ett år och de senaste tre månaderna.");
  });
  it("klarar saknade värden", () => {
    expect(changeSentence(null, -1.4)).toBe("Priserna har gått ner 1,4 % de senaste tre månaderna.");
    expect(changeSentence(5.1, undefined)).toBe("Priserna har gått upp 5,1 % på ett år.");
    expect(changeSentence(null, 0)).toBe("Priserna är i stort sett oförändrade de senaste tre månaderna.");
    expect(changeSentence(null, null)).toBe("");
  });
});

import { validate } from "class-validator";
import { SavePromptDto, SaveScenarioDto } from "./save-scenario.dto";

describe("SaveScenarioDto", () => {
  it("accepts Chinese scenario categories and script text inside prompts", async () => {
    const dto = Object.assign(new SaveScenarioDto(), {
      name: "安全测试",
      description: "",
      category: "默认",
      isActive: true,
      prompts: [
        Object.assign(new SavePromptDto(), {
          name: "安全反向用例",
          content:
            "- XSS 片段（如 <script>alert(1)</script>），若适用；\n- 拒绝访问或安全过滤",
        }),
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects HTML/script symbols in the category field", async () => {
    const dto = Object.assign(new SaveScenarioDto(), {
      name: "安全测试",
      description: "",
      category: "<script>",
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "category")).toBe(true);
  });
});

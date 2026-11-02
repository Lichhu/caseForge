import "reflect-metadata";
import { DataSource } from "typeorm";
import { ApiTestReportConfigEntity } from "./api-test-report-config.entity";

describe("ApiTestReportConfigEntity", () => {
  it("builds MySQL metadata for nullable string columns", async () => {
    const dataSource = new DataSource({
      type: "mysql",
      host: "127.0.0.1",
      username: "test",
      database: "test",
      entities: [ApiTestReportConfigEntity],
    });

    await expect((dataSource as any).buildMetadatas()).resolves.toBeUndefined();
  });
});

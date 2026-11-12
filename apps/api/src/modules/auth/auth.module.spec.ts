import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { UserContextMiddleware } from "@common/audit/user-context.middleware";
import configuration from "@config/configuration";
import { AuthModule } from "@auth/index";

const repositoryStub = {
  createQueryBuilder: jest.fn(),
};

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useValue: {
        entityMetadatas: [],
        options: {},
        getRepository: () => repositoryStub,
      },
    },
  ],
  exports: [DataSource],
})
class MockDataSourceModule {}

describe("AuthModule", () => {
  it("resolves the JWT middleware with the exported auth service", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        MockDataSourceModule,
        AuthModule,
      ],
      providers: [UserContextMiddleware],
    }).compile();

    expect(moduleRef.get(UserContextMiddleware)).toBeInstanceOf(
      UserContextMiddleware,
    );
    await moduleRef.close();
  });
});

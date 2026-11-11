import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { UserContextMiddleware } from "@common/audit/user-context.middleware";
import configuration from "@config/configuration";
import { AuthModule } from "@auth/index";

describe("AuthModule", () => {
  it("resolves the JWT middleware with the exported auth service", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
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

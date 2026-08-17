import { registerSecretBulkImportRouter } from "./secret-bulk-import-router";
import { registerSecretRouter } from "./secret-router";

export const registerV4Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSecretRouter, { prefix: "/secrets" });
  await server.register(registerSecretBulkImportRouter, { prefix: "/secrets/bulk-import" });
};

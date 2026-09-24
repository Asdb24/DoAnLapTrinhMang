import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { database, all } = await import("../src/server/db");
  database();
  if (process.argv.includes("--seed")) {
    const { seedDemo } = await import("../src/server/seed");
    seedDemo();
    console.log(
      "Demo seed ready. Demo login must also be enabled on the server.",
    );
  }
  console.log(
    "Database ready:",
    process.env.DATABASE_PATH || "./data/chatflow.sqlite",
  );
  console.table(all("SELECT name,applied_at FROM schema_migrations"));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const services = [
  "product-api",
  "payment-api",
  "notification-worker",
  "order-api",
  "shop-api",
];

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["--filter", "@tracelens/types", "build"]);
run("pnpm", ["--filter", "@tracelens/telemetry", "build"]);
run("pnpm", ["--filter", "./demo-services/*", "build"]);
run("pnpm", ["--filter", "@tracelens/api", "build"]);

rmSync(".deploy", { recursive: true, force: true });
mkdirSync(".deploy", { recursive: true });

for (const service of services) {
  console.log(`\n→ deploying ${service}`);
  run("pnpm", [
    "--filter",
    `@tracelens/${service}`,
    "deploy",
    "--prod",
    `.deploy/${service}`,
  ]);
}

console.log("\n→ deploying api");
run("pnpm", [
  "--filter",
  "@tracelens/api",
  "deploy",
  "--prod",
  ".deploy/api",
]);

console.log("\nDeploy bundles ready under .deploy/");

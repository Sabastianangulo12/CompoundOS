const { spawnSync } = require("node:child_process");

const baseUrl = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const memberWebUrl = (process.argv[3] || "http://localhost:19007").replace(/\/$/, "");

const windowsShell = process.env.ComSpec || "cmd.exe";

const commands =
  process.platform === "win32"
    ? [
        [windowsShell, ["/c", `npm run verify:ops -- ${baseUrl}`]],
        [process.execPath, ["scripts/validate-premium-release.js", baseUrl, memberWebUrl]],
        [windowsShell, ["/c", `npm run stress:ops -- ${baseUrl} 6`]],
        [windowsShell, ["/c", "npm run stress:multitenant -- 4"]],
        [windowsShell, ["/c", `npm run chaos:payments -- ${baseUrl}`]]
      ]
    : [
        ["npm", ["run", "verify:ops", "--", baseUrl]],
        ["node", ["scripts/validate-premium-release.js", baseUrl, memberWebUrl]],
        ["npm", ["run", "stress:ops", "--", baseUrl, "6"]],
        ["npm", ["run", "stress:multitenant", "--", "4"]],
        ["npm", ["run", "chaos:payments", "--", baseUrl]]
      ];

let pass = true;

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    cwd: process.cwd()
  });

  if (result.error || result.status !== 0) {
    if (result.error) {
      console.error(result.error);
    }
    pass = false;
    break;
  }
}

if (!pass) {
  process.exitCode = 1;
}

"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("node:os");

try {
  os.userInfo();
} catch (error) {
  if (error?.syscall !== "uv_os_get_passwd") throw error;
  const username = process.env.USERNAME?.trim() || process.env.USER?.trim() || "citemend-test";
  const homedir = process.env.USERPROFILE?.trim() || os.tmpdir();
  os.userInfo = () => ({ uid: -1, gid: -1, username, homedir, shell: null });
}

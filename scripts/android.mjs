import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2] ?? "sync";
if (!["sync", "build"].includes(command))
  throw new Error("Usage: node scripts/android.mjs [sync|build]");
const base = (
  process.env.ANDROID_API_BASE_URL ?? "http://10.0.2.2:3000"
).replace(/\/$/, "");
const url = new URL(base);
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error(
    "ANDROID_API_BASE_URL must be an HTTP(S) API URL without credentials, query or fragment.",
  );
const env = { ...process.env, VITE_API_BASE_URL: base };
function run(executable, args, cwd = root) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const java = process.env.JAVA_HOME
  ? join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "java.exe" : "java",
    )
  : "java";
if (command === "build") {
  const version = spawnSync(java, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (version.error || version.status !== 0)
    throw new Error(
      "Install JDK 21 and set JAVA_HOME (Android Studio includes a JDK). See README.md.",
    );
  if (!/version "21\./.test(version.stderr + version.stdout))
    throw new Error(
      "Use JDK 21 for the checked-in Gradle 8.11.1 / Capacitor 7 project; set JAVA_HOME to JDK 21.",
    );
  if (
    !process.env.ANDROID_HOME &&
    !process.env.ANDROID_SDK_ROOT &&
    !existsSync(resolve(root, "android/local.properties"))
  )
    throw new Error(
      "Set ANDROID_HOME to the Android SDK, or open android/ in Android Studio to generate local.properties. See README.md.",
    );
}
console.log("Bundling Android client; API: " + base);
run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-b"]);
run(process.execPath, [
  resolve(root, "node_modules/vite/bin/vite.js"),
  "build",
]);
run(process.execPath, [
  resolve(root, "node_modules/@capacitor/cli/bin/capacitor"),
  "sync",
  "android",
]);
if (command === "build") {
  run(
    java,
    [
      "-classpath",
      resolve(root, "android/gradle/wrapper/gradle-wrapper.jar"),
      "org.gradle.wrapper.GradleWrapperMain",
      "--no-daemon",
      "assembleDebug",
    ],
    resolve(root, "android"),
  );
  const apk = resolve(
    root,
    "android/app/build/outputs/apk/debug/app-debug.apk",
  );
  if (!existsSync(apk))
    throw new Error(
      "Gradle returned success but the expected APK is missing: " + apk,
    );
  console.log("APK ready: " + apk);
}

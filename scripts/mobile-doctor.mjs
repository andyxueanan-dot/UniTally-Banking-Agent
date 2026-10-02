import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = path.resolve(import.meta.dirname, '..');
const java = spawnSync('java', ['-version'], { encoding: 'utf8', windowsHide: true });
const sdkPaths = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk')].filter(Boolean);
const sdk = sdkPaths.find(p => fs.existsSync(path.join(p, 'platform-tools')) && fs.existsSync(path.join(p, 'platforms')));
const status = { node: process.versions.node, capacitorConfig: fs.existsSync(path.join(repo,'capacitor.config.ts')),
  androidProject: fs.existsSync(path.join(repo,'android/app/build.gradle')), webAssetsBuilt: fs.existsSync(path.join(repo,'dist-mobile/index.html')),
  javaAvailable: java.status === 0, androidSdkAvailable: Boolean(sdk),
  canAttemptAndroidBuild: java.status === 0 && Boolean(sdk), iosLocalBuildAvailable: process.platform === 'darwin',
  note: 'Android project and web assets are not an APK. This check does not prove SDK versions, accepted licenses, signing, device compatibility or backend readiness.' };
console.log(JSON.stringify(status, null, 2));
if (!status.canAttemptAndroidBuild) process.exitCode = 2;

// Applies to a freshly prebuilt android/ what build-android.ps1 applies to its
// mirror: the release signing block and the @react-native-voice Gradle patch.
// Run from mobile/ after `expo prebuild` and `npm ci`.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const mobile = process.cwd()
const scripts = join(mobile, 'scripts')

const gradleFile = join(mobile, 'android', 'app', 'build.gradle')
const snippet = readFileSync(join(scripts, 'android-signing.gradle.snippet'), 'utf8')
const gradle = readFileSync(gradleFile, 'utf8')
const pattern =
  /^    signingConfigs \{[\s\S]*?^        release \{\r?\n            \/\/ Caution![\s\S]*?^            signingConfig signingConfigs\.debug\r?\n/m

if (pattern.test(gradle)) {
  writeFileSync(gradleFile, gradle.replace(pattern, () => snippet))
  console.log('Applied release signing config to android/app/build.gradle')
} else if (!gradle.includes('hasReleaseKeystore')) {
  console.error('Could not patch android/app/build.gradle for release signing: layout changed after prebuild.')
  process.exit(1)
}

const voiceDir = join(mobile, 'node_modules', '@react-native-voice', 'voice', 'android')
if (existsSync(voiceDir)) {
  const patch = join(scripts, 'patches', 'react-native-voice')
  copyFileSync(join(patch, 'build.gradle'), join(voiceDir, 'build.gradle'))
  copyFileSync(join(patch, 'AndroidManifest.xml'), join(voiceDir, 'src', 'main', 'AndroidManifest.xml'))
  console.log('Applied Gradle patch to @react-native-voice/voice')
}

// Expo config plugin: on Windows, keep the C++ (CMake) build folders on a short path.
//
// Why: Windows limits paths to 260 characters and the ninja bundled with the Android SDK does
// not support longer ones. A native library's object files live under
//   <library>/android/.cxx/Debug/<hash>/<abi>/CMakeFiles/<target>.dir/<absolute source path>
// so the project folder's path is counted twice. From a normal checkout location that
// overflows, and the build stops with
//   ninja: error: mkdir(CMakeFiles/NitroModules.dir/C_/Users/...): No such file or directory
//
// What, on Windows only (other operating systems are left alone):
//   1. Every Gradle module's `.cxx` folder moves to <system drive>\vl-cxx\<module>. Set the
//      VOICELEDGER_CXX_DIR environment variable to use another folder. It only holds build
//      output and can be deleted at any time.
//   2. CMake's object path limit goes back to a Windows-safe 250 characters (Expo raises it to
//      1024), so CMake shortens object file names that would not fit. CMake can only hash the
//      folders of a path, never the file name, and some generated file names are over 130
//      characters on their own (react-native-iap's Nitro variants): with 240 the shortened
//      path still did not fit, so CMake kept the full one and the build failed. 250 leaves
//      room under Windows' 260 for the ".d" files ninja writes next to each object. An
//      explicit `expo.android.cmakeObjectPathMax` Gradle property still wins.
//
// `android/` is generated (continuous native generation), so this has to be a plugin: it is
// re-applied whenever `expo prebuild` or `expo run:android` regenerates the project.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// @voiceledger short-native-build-dir';

const GRADLE_BLOCK = `${MARKER}
if (org.gradle.internal.os.OperatingSystem.current().isWindows()) {
  // Expo raises CMake's object path limit to 1024, which needs a ninja with long-path support.
  // A Windows-safe limit makes CMake shorten (hash) object file names that would not fit.
  if (!project.hasProperty('expo.android.cmakeObjectPathMax')) {
    project.ext.set('expo.android.cmakeObjectPathMax', '250')
  }
  def cxxRoot = new File(System.getenv('VOICELEDGER_CXX_DIR') ?: "\${System.getenv('SystemDrive') ?: 'C:'}\\\\vl-cxx")
  subprojects { module ->
    ['com.android.application', 'com.android.library'].each { pluginId ->
      module.plugins.withId(pluginId) {
        module.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxRoot, module.name)
      }
    }
  }
}
`;

/**
 * Inserts the block once, ahead of the first root-level `apply plugin:` line. It has to be
 * registered before the Expo and React Native root plugins configure the modules: afterwards
 * Gradle refuses with "It is too late to set buildStagingDirectory". Running prebuild again
 * leaves the file unchanged.
 */
function addShortNativeBuildDir(buildGradle) {
  if (buildGradle.includes(MARKER)) return buildGradle;
  const firstApply = buildGradle.search(/^apply plugin:/m);
  if (firstApply === -1) {
    throw new Error(
      'with-short-native-build-dir: no root-level "apply plugin:" line in android/build.gradle.',
    );
  }
  return `${buildGradle.slice(0, firstApply)}${GRADLE_BLOCK}\n${buildGradle.slice(firstApply)}`;
}

function withShortNativeBuildDir(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('with-short-native-build-dir expects a Groovy android/build.gradle.');
    }
    gradleConfig.modResults.contents = addShortNativeBuildDir(gradleConfig.modResults.contents);
    return gradleConfig;
  });
}

module.exports = withShortNativeBuildDir;
module.exports.addShortNativeBuildDir = addShortNativeBuildDir;

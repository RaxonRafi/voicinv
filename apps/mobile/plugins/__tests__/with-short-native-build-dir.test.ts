import plugin from '../with-short-native-build-dir.cjs';

const { addShortNativeBuildDir } = plugin;

const BUILD_GRADLE = `buildscript {
  repositories { google() }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`;

describe('with-short-native-build-dir', () => {
  it('adds a Windows-only block that relocates every module’s CMake build folder', () => {
    const result = addShortNativeBuildDir(BUILD_GRADLE);

    expect(result).toContain('OperatingSystem.current().isWindows()');
    expect(result).toContain(
      'module.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxRoot, module.name)',
    );
    expect(result).toContain("'com.android.application', 'com.android.library'");
  });

  it('registers before the root plugins configure the modules, keeping the rest intact', () => {
    const result = addShortNativeBuildDir(BUILD_GRADLE);

    // Later than this, Gradle fails with "It is too late to set buildStagingDirectory".
    expect(result.indexOf('buildStagingDirectory')).toBeLessThan(
      result.indexOf('apply plugin: "expo-root-project"'),
    );
    expect(result.startsWith('buildscript {')).toBe(true);
    expect(result.endsWith('apply plugin: "com.facebook.react.rootproject"\n')).toBe(true);
  });

  it('restores a Windows-safe CMake object path limit unless one is set explicitly', () => {
    const result = addShortNativeBuildDir(BUILD_GRADLE);

    expect(result).toContain("if (!project.hasProperty('expo.android.cmakeObjectPathMax'))");
    expect(result).toContain("project.ext.set('expo.android.cmakeObjectPathMax', '250')");
    // The Expo root plugin reads the property when it is applied.
    expect(result.indexOf('cmakeObjectPathMax')).toBeLessThan(
      result.indexOf('apply plugin: "expo-root-project"'),
    );
  });

  it('lets the folder be overridden and defaults to the system drive', () => {
    const result = addShortNativeBuildDir(BUILD_GRADLE);

    expect(result).toContain("System.getenv('VOICELEDGER_CXX_DIR')");
    // Groovy source: "${System.getenv('SystemDrive') ?: 'C:'}\\vl-cxx"
    expect(result).toContain(`"\${System.getenv('SystemDrive') ?: 'C:'}\\\\vl-cxx"`);
  });

  it('changes nothing when applied again (prebuild runs it on every regeneration)', () => {
    const once = addShortNativeBuildDir(BUILD_GRADLE);
    expect(addShortNativeBuildDir(once)).toBe(once);
  });

  it('fails loudly when the build file has no place to insert the block', () => {
    expect(() => addShortNativeBuildDir('buildscript {}\n')).toThrow(/apply plugin/);
  });
});

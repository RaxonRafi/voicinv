import { type ConfigPlugin } from 'expo/config-plugins';

declare const withShortNativeBuildDir: ConfigPlugin & {
  /** Returns `android/build.gradle` with the short-build-folder block appended once. */
  addShortNativeBuildDir(buildGradle: string): string;
};

export = withShortNativeBuildDir;

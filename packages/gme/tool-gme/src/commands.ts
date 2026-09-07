/** Validated inputs used to build a GME CMake command. */
export interface GmeBuildCommandArgs {
  buildDirectory: string
  configuration: 'Debug' | 'Release' | 'RelWithDebInfo'
  target: string
  configure: boolean
  scope: 'all' | 'module'
  module?: string
}

/** Validated inputs used to build a GME GoogleTest command. */
export interface GmeTestCommandArgs {
  buildDirectory: string
  configuration: 'Debug' | 'Release' | 'RelWithDebInfo'
  filter: string
  repeat: number
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/
const GTEST_FILTER = /^[A-Za-z0-9_.*?/:=-]+$/
const RELATIVE_DIRECTORY = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/

export function validateIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} must be an identifier containing only letters, digits, _ or -`)
}

export function validateBuildDirectory(value: string): void {
  const normalized = value.replace(/\\/g, '/')
  if (!RELATIVE_DIRECTORY.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error('build_directory must be a relative path without parent traversal')
  }
}

export function validateGtestFilter(value: string): void {
  if (value.length === 0 || !GTEST_FILTER.test(value)) {
    throw new Error('filter contains unsupported GoogleTest filter characters')
  }
}

function normalizedDirectory(value: string): string {
  validateBuildDirectory(value)
  return value.replace(/\\/g, '/')
}

/** Build one platform-appropriate configure/build command from validated values. */
export function buildGmeCommand(args: GmeBuildCommandArgs, platform: NodeJS.Platform): string {
  validateIdentifier(args.target, 'target')
  const buildDirectory = normalizedDirectory(args.buildDirectory)
  let configure = ''
  if (args.configure) {
    const generator = platform === 'win32' ? ' -G "Visual Studio 17 2022" -A x64' : ''
    if (args.scope === 'module') {
      if (args.module === undefined) throw new Error('module is required when scope is module')
      validateIdentifier(args.module, 'module')
      configure = `cmake -S . -B "${buildDirectory}"${generator} -DBUILD_ALL_MODULE=OFF -DDEVELOP_${args.module.toUpperCase()}=ON`
    } else {
      configure = `cmake -S . -B "${buildDirectory}"${generator} -DBUILD_ALL_MODULE=ON -DTEST_ALL_MODULE=ON`
    }
  }
  const build = `cmake --build "${buildDirectory}" --target ${args.target} --config ${args.configuration}`
  if (!args.configure) return build
  return platform === 'win32'
    ? `${configure}; if ($LASTEXITCODE -eq 0) { ${build} }`
    : `${configure} && ${build}`
}

/** Build one platform-appropriate GoogleTest command from validated values. */
export function buildGtestCommand(args: GmeTestCommandArgs, platform: NodeJS.Platform): string {
  const buildDirectory = normalizedDirectory(args.buildDirectory)
  validateGtestFilter(args.filter)
  if (!Number.isInteger(args.repeat) || args.repeat < 1 || args.repeat > 100) {
    throw new Error('repeat must be an integer from 1 to 100')
  }
  const executable = platform === 'win32'
    ? `${buildDirectory}/${args.configuration}/tests.exe`
    : `${buildDirectory}/tests`
  return `"${executable}" --gtest_filter="${args.filter}" --gtest_repeat=${args.repeat}`
}

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Project Configuration Sanity Tests
 *
 * This PR touched several manifest and config files across the monorepo
 * (root/backend/mobile/validator-portal package.json, backend/validator-portal
 * .eslintrc.cjs, backend/jest.config.js, validator-portal/tsconfig.json) plus
 * the top-level README.md/AGENTS.md docs. These tests guard against
 * regressions in those files: that the documented npm scripts actually exist,
 * that the `snyk` references removed by this PR don't come back, that the
 * dependency/version bumps made by this PR are present, and that the
 * README's compliance language stays factual rather than reverting to
 * unearned certification claims.
 */

const REPO_ROOT = path.join(__dirname, '../../..');

function readJson(relativePath: string): any {
  const raw = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8');
  return JSON.parse(raw);
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf-8');
}

describe('Root package.json', () => {
  const pkg = readJson('package.json');

  it('is valid JSON describing the stamp-system workspace root', () => {
    expect(pkg.name).toBe('stamp-system');
    expect(pkg.private).toBe(true);
    expect(pkg.workspaces).toEqual(['backend', 'mobile', 'validator-portal']);
  });

  it('defines every script documented in README.md and AGENTS.md', () => {
    const documentedScripts = [
      'setup:dev',
      'dev:backend',
      'dev:portal',
      'dev:demo',
      'dev:mobile',
      'build:all',
      'test:backend',
      'test:all',
      'lint:all',
      'db:migrate',
      'db:seed'
    ];

    for (const script of documentedScripts) {
      expect(pkg.scripts).toHaveProperty(script);
      expect(typeof pkg.scripts[script]).toBe('string');
    }
  });

  it('runs security audits across workspaces without a snyk dependency', () => {
    expect(pkg.scripts['security:audit']).toBe('npm audit --workspaces');
    expect(JSON.stringify(pkg)).not.toMatch(/snyk/i);
  });
});

describe('Backend package.json', () => {
  const pkg = readJson('backend/package.json');

  it('runs jest against the local jest.config.js', () => {
    expect(pkg.scripts.test).toBe('jest --config jest.config.js');
  });

  it('has no snyk devDependency and audits with plain npm audit', () => {
    expect(pkg.scripts['security:audit']).toBe('npm audit');
    expect(JSON.stringify(pkg)).not.toMatch(/snyk/i);
  });

  it('no longer depends on ethers now that BlockchainVerificationService is a local adapter', () => {
    expect(pkg.dependencies).not.toHaveProperty('ethers');
    expect(pkg.devDependencies).not.toHaveProperty('ethers');
  });
});

describe('Mobile package.json', () => {
  const pkg = readJson('mobile/package.json');

  it('pins react-native-svg to the patched version', () => {
    expect(pkg.dependencies['react-native-svg']).toBe('^14.1.0');
  });

  it('has no snyk references and audits with plain npm audit', () => {
    expect(pkg.scripts['security:audit']).toBe('npm audit');
    expect(JSON.stringify(pkg)).not.toMatch(/snyk/i);
  });
});

describe('Validator portal package.json', () => {
  const pkg = readJson('validator-portal/package.json');

  it('adds react-router-dom as a dependency', () => {
    expect(pkg.dependencies['react-router-dom']).toBe('^6.30.1');
  });

  it('has no snyk references and audits with plain npm audit', () => {
    expect(pkg.scripts['security:audit']).toBe('npm audit');
    expect(JSON.stringify(pkg)).not.toMatch(/snyk/i);
  });
});

describe('ESLint configs', () => {
  it('backend .eslintrc.cjs targets Node/Jest with no custom rule overrides', () => {
    // eslint config files are plain CommonJS modules.
    const eslintConfig = require(path.join(REPO_ROOT, 'backend/.eslintrc.cjs'));

    expect(eslintConfig.root).toBe(true);
    expect(eslintConfig.parser).toBe('@typescript-eslint/parser');
    expect(eslintConfig.plugins).toContain('@typescript-eslint');
    expect(eslintConfig.env).toMatchObject({ node: true, jest: true });
    expect(eslintConfig.rules).toEqual({});
  });

  it('validator-portal .eslintrc.cjs targets a browser/JSX environment', () => {
    const eslintConfig = require(path.join(REPO_ROOT, 'validator-portal/.eslintrc.cjs'));

    expect(eslintConfig.root).toBe(true);
    expect(eslintConfig.parser).toBe('@typescript-eslint/parser');
    expect(eslintConfig.plugins).toContain('@typescript-eslint');
    expect(eslintConfig.env).toMatchObject({ browser: true, node: true });
    expect(eslintConfig.parserOptions.ecmaFeatures.jsx).toBe(true);
  });
});

describe('Backend jest.config.js', () => {
  it('is configured for ts-jest against backend/src test files', () => {
    const jestConfig = require(path.join(REPO_ROOT, 'backend/jest.config.js'));

    expect(jestConfig.preset).toBe('ts-jest');
    expect(jestConfig.testEnvironment).toBe('node');
    expect(jestConfig.roots).toEqual(['<rootDir>/src']);
    expect(jestConfig.testMatch).toEqual(['**/tests/**/*.test.ts']);
    expect(jestConfig.clearMocks).toBe(true);
  });
});

describe('Validator portal tsconfig.json', () => {
  const tsconfig = readJson('validator-portal/tsconfig.json');

  it('keeps strict mode on while allowing unused locals/parameters', () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUnusedLocals).toBe(false);
    expect(tsconfig.compilerOptions.noUnusedParameters).toBe(false);
    expect(tsconfig.compilerOptions.noFallthroughCasesInSwitch).toBe(true);
  });
});

describe('Documentation & script sync (README.md / AGENTS.md)', () => {
  const readme = readText('README.md');
  const agents = readText('AGENTS.md');
  const rootPkg = readJson('package.json');

  it('README quick-start commands all exist as root package.json scripts', () => {
    const readmeCommands = ['setup:dev', 'dev:backend', 'dev:portal', 'dev:demo', 'test:backend'];

    for (const command of readmeCommands) {
      expect(readme).toContain(`npm run ${command}`);
      expect(rootPkg.scripts).toHaveProperty(command);
    }
  });

  it('AGENTS.md run commands all exist as root package.json scripts', () => {
    const agentCommands = ['dev:backend', 'dev:portal', 'dev:demo', 'test:backend'];

    for (const command of agentCommands) {
      expect(agents).toContain(`npm run ${command}`);
      expect(rootPkg.scripts).toHaveProperty(command);
    }
  });
});

describe('Compliance language regression', () => {
  const readme = readText('README.md');

  it('does not reintroduce unearned certification claims', () => {
    expect(readme).not.toMatch(/✅.*(HIPAA|SOC\s?2|GDPR|CCPA)/i);
    expect(readme).not.toMatch(/HIPAA Title II compliance/i);
  });

  it('states the honest, not-yet-certified compliance status', () => {
    expect(readme).toMatch(/not yet certified or audited/i);
  });
});
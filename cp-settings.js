/**
 * CloudPress Settings & Runtime Initialization
 *
 * [v3.1 성능 개선]
 * - preloadOptions(): 부트 시 autoload 옵션 1회 배치 로드
 * - parallel 초기화: 세션 + 플러그인 로드 병렬 실행
 *
 * @package CloudPress
 */

import { CP_VERSION, CPINC, CPADMIN } from './cp-config.js';
import { loadActivePlugins }           from './cp-includes/plugin-loader.js';
import { loadActiveTheme }             from './cp-includes/theme-loader.js';
import { registerCoreHooks }           from './cp-includes/hooks.js';
import { initSession }                 from './cp-includes/session.js';
import { preloadOptions }              from './cp-includes/option.js';

export async function cpSettings(cp) {
  cp.version = CP_VERSION;
  cp.cpinc   = CPINC;
  cp.cpadmin = CPADMIN;

  // 코어 훅 등록
  registerCoreHooks(cp);

  // 성능: autoload 옵션 사전 로드 (이후 getOption이 DB를 치지 않음)
  await preloadOptions(cp);

  // 세션 초기화 + 플러그인 로드 병렬 실행
  await Promise.allSettled([
    initSession(cp),
    cp.config.installed ? loadActivePlugins(cp) : Promise.resolve(),
  ]);

  if (cp.config.installed) {
    cp.hooks.doAction('cp_plugins_loaded', cp);
  }

  // 테마 로드
  await loadActiveTheme(cp);

  cp.hooks.doAction('cp_init', cp);
  cp.hooks.doAction('cp_loaded', cp);
}

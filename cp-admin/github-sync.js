/**
 * CloudPress GitHub Sync AJAX handler
 *
 * This module re-uses the shared AJAX dispatcher from ajax.js.
 * handleGithubSync is a named alias kept for routing clarity in index.js.
 *
 * @package CloudPress
 */

export { registerAjaxAction, handleAjax } from './ajax.js';

/**
 * Handle GitHub sync requests.
 * Alias of handleAjax — routes /cp-admin/github-sync/* to the AJAX dispatcher.
 */
export { handleAjax as handleGithubSync } from './ajax.js';

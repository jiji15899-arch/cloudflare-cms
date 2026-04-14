/**
 * Loads the CloudPress environment and template.
 * Replaces WordPress wp-blog-header.php
 *
 * @package CloudPress
 */

import { cpLoad } from './cp-load.js';
import { cpQuery } from './cp-includes/query.js';
import { loadTemplate } from './cp-includes/template-loader.js';

let _cp_did_header = false;

export async function handleRequest(request, env, ctx, options = {}) {
  if (_cp_did_header) {
    return new Response('Already loaded', { status: 500 });
  }
  _cp_did_header = true;

  // Load the CloudPress environment (config, DB, KV, etc.)
  const cp = await cpLoad(request, env, ctx, options);

  // Set up the CloudPress query (routing)
  await cpQuery(request, cp);

  // Load and render the theme template
  return loadTemplate(request, cp);
}

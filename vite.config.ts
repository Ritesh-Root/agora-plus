import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {relayPlugin} from './server/relay';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Server-only settings from .env reach the relay, MCP and household routes in this process.
  // The shell wins over .env, and an unset name stays unset (assigning undefined would store "undefined").
  const serverNames = [
    'DASHSCOPE_API_KEY', 'TYPESAFE_API_KEY', 'JEV_API_KEY', 'TYPESAFE_BASE_URL', 'JEV_MODEL', 'EXA_API_KEY',
    'FIRECRAWL_API_KEY', 'ALEXA_SIM_MODEL', 'ALEXA_SIM_FAST_PATH',
  ];
  const serverPrefixes = ['AGORA_', 'AWS_', 'BEDROCK_', 'POLLY_'];
  for (const [name, value] of Object.entries(env)) {
    const wanted = serverNames.includes(name) || serverPrefixes.some((prefix) => name.startsWith(prefix));
    if (wanted && value && !process.env[name]) process.env[name] = value;
  }
  return {
    base: '/',
    plugins: [react(), tailwindcss(), relayPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

/** @type {import('next').NextConfig} */
import path from 'path';

const nextConfig = {
  compress: false,
  outputFileTracingRoot: path.resolve('.'),
  serverExternalPackages: [
    'discord.js',
    '@discordjs/voice',
    '@discordjs/rest',
    '@discordjs/ws',
    'prism-media',
    'opusscript',
    'bullmq',
    'ioredis',
    'ws',
  ],
};

export default nextConfig;

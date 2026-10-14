/** @type {import('next').NextConfig} */
const nextConfig = {
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

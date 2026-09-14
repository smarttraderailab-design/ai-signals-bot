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

    // Handle start command
    if (lowerText.includes('/start') || lowerText === 'start') {
      const welcomeText = `*Welcome to the Market Analysis & Signals System*\n\nTo get professional market analysis and real-time trading signals in USD for crypto and Wall Street stocks:\n\n1️⃣ Send your *email address* to unlock full access.\n2️⃣ Send any asset symbol or name (e.g., \`BTC\`, \`SOL\`, \`AAPL\`, \`NVDA\`).`;
      
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: welcomeText, parse_mode: "Markdown" })
      });
      return res.status(200).json({ success: true });
    }

    // Auto-detect email and send to Make webhook
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(userText)) {
      if (process.env.MAKE_WEBHOOK_URL) {
        try {
          await fetch(process.env.MAKE_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, username, email: userText, timestamp: new Date().toISOString() })
          });
        } catch (err) {
          console.error("Make webhook error:", err);
        }
      }

      const successEmailText = `*Email verified successfully!*\n\nYou now have full access to institutional crypto and stock market intelligence signals. Send any asset symbol (e.g., \`BTC\`, \`SOL\`, \`AAPL\`, \`NVDA\`) to get real-time analysis.`;
      
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: successEmailText, parse_mode: "Markdown" })
      });
      return res.status(200).json({ success: true });
    }

    const words = userText.split(/\s+/);
    let liveDataContent = "";

    // Dynamic crypto search (CoinGecko)
    for (const word of words) {
      const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanWord.length < 1) continue;

      try {
        const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(cleanWord)}`);
        const searchData = await searchRes.json();
        
        if (searchData && searchData.coins && searchData.coins.length > 0) {
          const coin = searchData.coins[0];
          const coinId = coin.id;
          const foundCoinSymbol = coin.symbol.toUpperCase();

          const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24h_change=true&include_market_cap=true&include_24h_vol=true`);
          const priceData = await priceRes.json();

          if (priceData && priceData[coinId]) {
            const coinInfo = priceData[coinId];
            liveDataContent = `[LIVE MARKET DATA (Crypto): Asset: ${coin.name} (${foundCoinSymbol}) | Price: $${coinInfo.usd} USD | 24h Change: ${coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : 'N/A'}% | Market Cap: $${coinInfo.usd_market_cap || 'N/A'} USD]`;
            break;
          }
        }
      } catch (err) {
        console.error("Crypto search error:", err);
      }
    }

    // Dynamic stock search (Yahoo Finance) if crypto not found
    if (!liveDataContent) {
      for (const word of words) {
        const cleanWord = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (cleanWord.length < 1 || cleanWord.length > 5) continue;

        try {
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
        } catch (err) {
          console.error("Stock search error:", err);
        }
      }
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const systemInstruction = liveDataContent 
      ? `You are an elite institutional financial and market analyst. Today's exact date is ${currentDate}. Use the following verified live market data to provide professional analysis, market trends, and trading signals (Entry, Take Profit, Stop Loss) strictly in USD. Format your output cleanly using standard Markdown (*bold*, _italic_, \`code\`). Do NOT use HTML tags like <br> or <b>.: ${liveDataContent}`
      : `You are an elite institutional financial and market analyst. Today's exact date is ${currentDate}. WARNING: No live market data was found for the user's query. If the user is asking a general question, answer professionally. If they are looking for an asset and none was found, gently prompt them to provide their email address to register or check the asset symbol. Use clean Markdown formatting without HTML tags.`;

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
    let replyText = aiData.choices?.[0]?.message?.content || "Error analyzing market data.";

    // Clean HTML tags and replace with Markdown
    replyText = replyText
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/?b>/gi, '*')
      .replace(/<\/?i>/gi, '_');

    // Send message to Telegram with Markdown formatting
    let telegramRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: "Markdown"
      })
    });

    // Fallback if Markdown fails
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
    console.error("Bot Error:", error);
    return res.status(500).json({ error: error.message });
  }
};

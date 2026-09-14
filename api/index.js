 module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send('Bot is active with dynamic coin search.');
    }

    const body = req.body || {};
    const message = body.message;
    if (!message || !message.text) {
      return res.status(200).json({ success: true });
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();
    const words = userText.split(/\s+/);
    
    let liveDataContent = "";

    // חיפוש דינמי של כל מטבע שהמשתמש מקליד דרך מנוע החיפוש של CoinGecko
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
            liveDataContent = `[LIVE MARKET DATA: Asset: ${coin.name} (${foundCoinSymbol}) | Price: $${coinInfo.usd} USD | 24h Change: ${coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : 'N/A'}% | Market Cap: $${coinInfo.usd_market_cap || 'N/A'} USD | 24h Volume: $${coinInfo.usd_24h_vol || 'N/A'} USD]`;
            break; // נמצא מטבע, עוצרים את החיפוש
          }
        }
      } catch (err) {
        console.error("Search fetch error for word:", cleanWord, err);
      }
    }

    const systemInstruction = liveDataContent 
      ? `You are an elite institutional crypto analyst. Use the following verified live market data to provide professional analysis and trading signals (Entry, Take Profit, Stop Loss) strictly in USD: ${liveDataContent}`
      : `You are an elite institutional crypto analyst. WARNING: No live market data was found for the user's query. Do NOT guess or invent prices. Clearly state that live data is currently unavailable for this specific asset, but provide general technical insights if applicable.`;

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
    const replyText = aiData.choices?.[0]?.message?.content || "Error analyzing market data.";

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText
      })
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Bot Error:", error);
    return res.status(500).json({ error: error.message });
  }
};

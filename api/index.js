 module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send('Bot is active with live trading signals.');
    }

    const body = req.body || {};
    const message = body.message;
    if (!message || !message.text) {
      return res.status(200).json({ success: true });
    }

    const chatId = message.chat.id;
    const userText = message.text.trim();
    const lowerText = userText.toLowerCase();

    const coinMap = {
      "btc": "bitcoin", "bitcoin": "bitcoin",
      "eth": "ethereum", "ethereum": "ethereum",
      "sol": "solana", "solana": "solana",
      "xrp": "ripple", "doge": "dogecoin",
      "zec": "zcash", "arb": "arbitrum"
    };

    let matchedCoinId = null;
    for (const [key, id] of Object.entries(coinMap)) {
      if (lowerText.includes(key)) {
        matchedCoinId = id;
        break;
      }
    }

    let liveDataContent = "";
    if (matchedCoinId) {
      try {
        const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${matchedCoinId}&vs_currencies=usd&include_24h_change=true&include_market_cap=true&include_24h_vol=true`);
        const priceData = await priceRes.json();
        if (priceData[matchedCoinId]) {
          const coinInfo = priceData[matchedCoinId];
          liveDataContent = `[Live Market Data for ${matchedCoinId.toUpperCase()}: Price: $${coinInfo.usd} USD | 24h Change: ${coinInfo.usd_24h_change ? coinInfo.usd_24h_change.toFixed(2) : 'N/A'}% | Market Cap: $${coinInfo.usd_market_cap || 'N/A'} USD | 24h Volume: $${coinInfo.usd_24h_vol || 'N/A'} USD]`;
        }
      } catch (e) {
        console.error("Price fetch error:", e);
      }
    }

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: `You are an elite institutional crypto and financial market intelligence analyst. Your task is to provide real-time market updates, trend analysis, and professional trading signals (including Entry, Take Profit targets, and Stop Loss) strictly in USD. Use the provided live data. Format the response cleanly for Telegram with clear sections: Market Overview, Key Levels, and Actionable Trading Signal. ${liveDataContent}` 
          },
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
